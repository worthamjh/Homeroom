import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { fetchBoardContent, saveBoardContent, deleteBoardContent } from "./lib/boardContentApi";
import { createKamiBellRingerDoc, googleDriveConfigured } from "./lib/googleDrive";

/**
 * FullAgendaBoard
 *
 * A "Blackboard Configuration" content template — the classic full-board
 * format a lot of districts/admins expect (modeled directly on Jay's own
 * reference photo): Objectives & Benchmarks, Essential Question, Agenda,
 * Bell Ringer, Home Learning. Renders inside the same goals-column slot
 * the Simple Goals checklist occupies (alongside the SmartBoard/slides),
 * not instead of it.
 *
 * Essential Question / Agenda / Bell Ringer / Home Learning are freely
 * editable in place (click to edit, click away or Tab out to save) and
 * persisted to localStorage per-lesson, so a teacher can make that content
 * "whatever they want" while still having a sensible prefilled default.
 *
 * Objectives & Benchmarks is deliberately NOT a separate editable field —
 * it renders the lesson's actual Learning Goals checklist (same data,
 * same checked/unchecked state, same toggle) so a teacher never has to
 * enter the same objectives twice under two different labels.
 *
 * Sliding Boards support: when Sliding Boards is on, Full Agenda behaves
 * exactly like Simple Goals — the *entire* board (Objectives checklist AND
 * the Essential Question/Agenda/Bell Ringer/Home Learning fields) is what
 * physically slides, via ChalkboardBoardRow's real rail/dock mechanic, not
 * a separate scoped-down slider. To make that possible without each
 * sliding panel owning its own independent (and therefore driftable) copy
 * of the freeform field content, the content state lives in ONE place —
 * `useFullAgendaFields`, called once by the caller (WebsterGrovesChemistry
 * .jsx) — and is handed down as props to `FullAgendaFields`, a purely
 * presentational component safe to render into every sliding panel's face
 * (ChalkboardBoardRow's `extraContent`) without any of them drifting out
 * of sync with each other.
 *
 * Exports:
 *   defaultFullAgendaContent()
 *   useFullAgendaFields(storageKey) — hook, single source of truth for the
 *     freeform fields' content/edit state.
 *   FullAgendaFields(props) — presentational render of Reset button +
 *     the 4 freeform sections, driven entirely by props from the hook.
 *   ObjectivesChecklist(props) — the flat (non-sliding) Objectives list,
 *     also used standalone by the Simple Goals equivalent in
 *     WebsterGrovesChemistry.jsx... actually Simple Goals has its own
 *     inline flat list; this one is Full-Agenda-labeled and reused by
 *     ChalkboardBoardRow isn't needed there since that component has its
 *     own goals rendering — ObjectivesChecklist is for the non-sliding
 *     Full Agenda case only.
 *   FullAgendaBoard (default) — convenience wrapper combining
 *     ObjectivesChecklist + FullAgendaFields for the non-sliding case.
 */

export function defaultFullAgendaContent() {
  return {
    essentialQuestion: "",
    agenda: "",
    bellRinger: "",
    bellRingerKamiUrl: "",
    homeLearning: "",
    learningGoals: "",
  };
}

function loadContent(storageKey) {
  if (typeof window === "undefined") return defaultFullAgendaContent();
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey));
    // Merge over defaults rather than replace, so a field a teacher never
    // touched still shows something sensible instead of a stale gap.
    return saved ? { ...defaultFullAgendaContent(), ...saved } : defaultFullAgendaContent();
  } catch {
    return defaultFullAgendaContent();
  }
}

// Which Agenda lines (by their line index within the agenda text) a
// teacher has checked off — its own small piece of state, separate from
// `content` itself, since checking an item off isn't editing the agenda
// text. Stored under a sibling key so it survives a refresh the same way
// the rest of a lesson's board content does, and resets along with
// everything else on "Reset Board".
function agendaCheckedKey(storageKey) { return `${storageKey}:agendaChecked`; }
function loadAgendaChecked(storageKey) {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(agendaCheckedKey(storageKey))) || {};
  } catch {
    return {};
  }
}

// Same idea as agendaCheckedKey/loadAgendaChecked above, but for the
// editable Learning Goals field (see FULL_AGENDA_FIELD_META below) -- a
// teacher-authored goals list gets the same per-line checkbox treatment
// Agenda already has, tracked independently of the goals text itself.
function learningGoalsCheckedKey(storageKey) { return `${storageKey}:learningGoalsChecked`; }
function loadLearningGoalsChecked(storageKey) {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(learningGoalsCheckedKey(storageKey))) || {};
  } catch {
    return {};
  }
}

const DEFAULT_SURFACE = { accent: "var(--board-secondary-accent)", headerText: "var(--board-secondary-accent)", bodyText: "rgba(255,255,255,0.88)", bodyTextChecked: "rgba(255,255,255,0.3)", placeholderText: "rgba(255,255,255,0.4)", dividerBorder: "rgba(255,255,255,0.2)", textShadow: "1px 1px 2px rgba(0,0,0,0.5)", checkboxBorder: "rgba(255,255,255,0.4)" };

// Single source of truth for Full Agenda's freeform field content. Call
// this ONCE per active lesson (in WebsterGrovesChemistry.jsx's App()),
// never inside something that gets rendered multiple times (like a
// per-panel component), or independent copies of "content" would drift
// out of sync with each other as a teacher edits.
//
// `mongoKey` (optional: { teacherId, unitIdx, lessonTitle }) is what makes
// this content survive a different browser or a cleared cache instead of
// living only in THIS browser's localStorage (loadContent/save above
// still write there first, unconditionally — an instant, offline-
// friendly cache; Mongo is purely additive on top of it). Pass null/
// undefined to skip the Mongo mirror entirely (e.g. no lesson is active
// yet). On mount/lesson change, whatever's saved remotely is fetched and
// merged over the localStorage-seeded state — remote wins per-field,
// since another device may have edited more recently than this browser's
// own cache.
export function useFullAgendaFields(storageKey, mongoKey) {
  const [content, setContent] = useState(() => loadContent(storageKey));
  const [editingKey, setEditingKey] = useState(null);
  const [checkedAgendaLines, setCheckedAgendaLines] = useState(() => loadAgendaChecked(storageKey));
  const [checkedLearningGoalsLines, setCheckedLearningGoalsLines] = useState(() => loadLearningGoalsChecked(storageKey));

  // Reload (keeping any prior edits for *this* lesson) whenever the
  // storage key changes — i.e. the teacher navigated to a different lesson.
  useEffect(() => {
    setContent(loadContent(storageKey));
    setEditingKey(null);
    setCheckedAgendaLines(loadAgendaChecked(storageKey));
    setCheckedLearningGoalsLines(loadLearningGoalsChecked(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!mongoKey) return;
    let cancelled = false;
    fetchBoardContent(mongoKey.teacherId, mongoKey.unitIdx, mongoKey.lessonTitle)
      .then(remote => {
        if (cancelled || !remote) return;
        const { checkedAgendaLines: remoteChecked, checkedLearningGoalsLines: remoteGoalsChecked, ...remoteText } = remote;
        if (Object.keys(remoteText).length) setContent(prev => ({ ...prev, ...remoteText }));
        if (remoteChecked && Object.keys(remoteChecked).length) setCheckedAgendaLines(prev => ({ ...prev, ...remoteChecked }));
        if (remoteGoalsChecked && Object.keys(remoteGoalsChecked).length) setCheckedLearningGoalsLines(prev => ({ ...prev, ...remoteGoalsChecked }));
      })
      .catch(() => {}); // no saved data yet, or a transient error — this browser's own cache stands
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mongoKey?.teacherId, mongoKey?.unitIdx, mongoKey?.lessonTitle]);

  const save = (key, value) => {
    setEditingKey(null);
    setContent(prev => {
      const next = { ...prev, [key]: value };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
    if (mongoKey) saveBoardContent(mongoKey.teacherId, mongoKey.unitIdx, mongoKey.lessonTitle, { [key]: value }).catch(() => {});
  };

  // Toggles one Agenda line's checked state by its position in the
  // (non-empty-line-filtered) list — independent of `content.agenda`
  // itself, since checking an item shouldn't count as editing the text.
  const toggleAgendaLine = (lineIdx) => {
    setCheckedAgendaLines(prev => {
      const next = { ...prev, [lineIdx]: !prev[lineIdx] };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(agendaCheckedKey(storageKey), JSON.stringify(next)); } catch { /* ignore */ }
      }
      if (mongoKey) saveBoardContent(mongoKey.teacherId, mongoKey.unitIdx, mongoKey.lessonTitle, { checkedAgendaLines: next }).catch(() => {});
      return next;
    });
  };

  // Same as toggleAgendaLine, for the editable Learning Goals field.
  const toggleLearningGoalsLine = (lineIdx) => {
    setCheckedLearningGoalsLines(prev => {
      const next = { ...prev, [lineIdx]: !prev[lineIdx] };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(learningGoalsCheckedKey(storageKey), JSON.stringify(next)); } catch { /* ignore */ }
      }
      if (mongoKey) saveBoardContent(mongoKey.teacherId, mongoKey.unitIdx, mongoKey.lessonTitle, { checkedLearningGoalsLines: next }).catch(() => {});
      return next;
    });
  };

  const resetToDefaults = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset this board back to the default template for this lesson? Your edits will be lost.")) return;
    const fresh = defaultFullAgendaContent();
    setContent(fresh);
    setEditingKey(null);
    setCheckedAgendaLines({});
    setCheckedLearningGoalsLines({});
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey);
        window.localStorage.removeItem(agendaCheckedKey(storageKey));
        window.localStorage.removeItem(learningGoalsCheckedKey(storageKey));
      } catch { /* ignore */ }
    }
    if (mongoKey) deleteBoardContent(mongoKey.teacherId, mongoKey.unitIdx, mongoKey.lessonTitle).catch(() => {});
  };

  return { content, editingKey, setEditingKey, save, resetToDefaults, checkedAgendaLines, toggleAgendaLine, checkedLearningGoalsLines, toggleLearningGoalsLine };
}

// The one header style shared by EVERY board content section — Essential
// Question, Agenda, Bell Ringer, Home Learning, and Objectives &
// Benchmarks/Learning Goals all render through this SAME function rather
// than each having its own copy of the same style object, specifically so
// they can never visually drift apart from each other again (Jay caught a
// case where Objectives' heading looked different from the others').
function SectionHeader({ label, surface, onClick, kamiIndicator }) {
  return (
    <div
      onClick={onClick}
      style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: surface.accent, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: 6, display: "flex", alignItems: "center", gap: 6, cursor: onClick ? "pointer" : "default" }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {kamiIndicator && (
        <span style={{ fontSize: 9, background: "rgba(255,255,255,0.15)", borderRadius: 3, padding: "2px 7px", letterSpacing: 0.5, color: surface.accent, fontFamily: "Lato, sans-serif" }}>📄 tap to open</span>
      )}
    </div>
  );
}

// Metadata for the four freeform Full Agenda fields (label, placeholder,
// textarea row count) — one place both FullAgendaFields (the all-four,
// fixed-order block still used by Sliding Boards) and EditableField (the
// single-field version the flat, reorderable board content column uses)
// read from, so the two can never describe the same field differently.
export const FULL_AGENDA_FIELD_META = {
  essentialQuestion: { label: "Essential Question", placeholder: "Click to add today’s essential question...", rows: 2 },
  // itemized: each non-empty line of Agenda gets its own checkbox (see
  // Section below) instead of rendering as a single block of text — Jay's
  // ask: agenda items should be individually clickable to check off, and
  // the text itself shouldn't be selectable the way a plain paragraph is.
  agenda: { label: "Agenda", placeholder: "Add an agenda item...", rows: 5, itemized: true },
  bellRinger: { label: "Bell Ringer", placeholder: "Click to add a bell ringer / warm-up...", rows: 2 },
  homeLearning: { label: "Home Learning", placeholder: "Click to add homework / home learning...", rows: 2 },
  // Editable Learning Goals -- for lessons with no curriculum-authored
  // goals at all (see useEditableLearningGoals in WebsterGrovesChemistry
  // .jsx), a teacher can type their own goals list here instead of the
  // read-only ObjectivesChecklist, one goal per line, itemized the same
  // way Agenda is so each line gets its own checkbox.
  learningGoals: { label: "Learning Goals", placeholder: "Add a learning goal...", rows: 4, itemized: true },
};

// One section = a header + a body that's either rendered text (bulleted,
// one line per non-empty row) or, while editing, a textarea. Shared by
// every freely-editable field below so the click-to-edit behavior is
// consistent.
//
// `itemized` (Agenda only, see FULL_AGENDA_FIELD_META above) swaps the
// plain-text display for one checkbox row per line — `checkedLines`/
// `onToggleLine` are keyed by a line's position in the filtered
// (non-empty) list, from useFullAgendaFields' own checkedAgendaLines
// state, so checking an item off is independent of editing the text
// itself. Each row uses userSelect: "none" so clicking to check something
// off doesn't drag-select the text the way clicking plain paragraph text
// would.
function splitGoalLines(raw) {
  return (raw || "").split("\n").filter(l => l.trim().length > 0);
}

// Small Kami URL input — build mode only, Bell Ringer section.
function KamiUrlInput({ kamiUrl, onSaveKamiUrl, lessonLabel, surface = DEFAULT_SURFACE }) {
  const [draft, setDraft] = useState(kamiUrl || "");
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  useEffect(() => { setDraft(kamiUrl || ""); setSaved(false); }, [kamiUrl]);
  const handleSave = () => { onSaveKamiUrl(draft.trim()); setSaved(true); setTimeout(() => setSaved(false), 1800); };

  const handleAutoCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const title = lessonLabel ? `Bell Ringer — ${lessonLabel} — ${dateStr}` : undefined;
      const { kamiUrl: newUrl, name } = await createKamiBellRingerDoc({ title });
      onSaveKamiUrl(newUrl);
      setDraft(newUrl);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setCreateError(err.message || "Couldn't create the file.");
    } finally {
      setCreating(false);
    }
  };

  const canAutoCreate = googleDriveConfigured();

  return (
    <div style={{ marginTop: 8, borderTop: `1px dashed ${surface.dividerBorder}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: "Lato, sans-serif", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: surface.placeholderText }}>
        📄 Bell Ringer · Kami
      </div>

      {/* Auto-create row — shown when Google Drive is configured */}
      {canAutoCreate && !kamiUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <button
            onClick={handleAutoCreate}
            disabled={creating}
            style={{
              fontFamily: "Oswald, sans-serif", fontSize: 11, letterSpacing: 0.5,
              padding: "5px 14px",
              background: creating ? "rgba(255,255,255,0.06)" : "rgba(255,165,0,0.18)",
              border: `1px solid ${creating ? surface.dividerBorder : "rgba(255,165,0,0.5)"}`,
              borderRadius: 4, color: creating ? surface.placeholderText : "#ffb347",
              cursor: creating ? "default" : "pointer", transition: "all 0.2s",
            }}
          >
            {creating ? "⏳ Creating…" : "⚡ Auto-create Kami doc"}
          </button>
          <span style={{ fontFamily: "Lato, sans-serif", fontSize: 10, color: surface.placeholderText }}>
            or paste a link below
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="url"
          value={draft}
          onChange={e => { setDraft(e.target.value); setSaved(false); }}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setDraft(kamiUrl || ""); }}
          placeholder="https://web.kamihq.com/web/viewer.html?state=..."
          style={{ flex: 1, fontFamily: "Lato, sans-serif", fontSize: 12, padding: "4px 8px", background: "rgba(255,255,255,0.08)", border: `1px solid ${surface.dividerBorder}`, borderRadius: 4, color: "#fff", outline: "none", minWidth: 0 }}
          onFocus={e => { e.currentTarget.style.borderColor = surface.accent; }}
          onBlur={e => { e.currentTarget.style.borderColor = surface.dividerBorder; }}
        />
        <button
          onClick={handleSave}
          disabled={draft.trim() === (kamiUrl || "")}
          style={{ fontFamily: "Lato, sans-serif", fontSize: 11, padding: "4px 12px", background: saved ? "rgba(100,220,100,0.2)" : "rgba(255,255,255,0.1)", border: `1px solid ${saved ? "rgba(100,220,100,0.5)" : surface.dividerBorder}`, borderRadius: 4, color: saved ? "#7de87d" : "#fff", cursor: "pointer", opacity: draft.trim() === (kamiUrl || "") ? 0.4 : 1, transition: "all 0.2s" }}
        >
          {saved ? "✓ Saved" : "Save"}
        </button>
        {kamiUrl && (
          <button onClick={() => { setDraft(""); onSaveKamiUrl(""); }} title="Remove Kami link"
            style={{ fontFamily: "Lato, sans-serif", fontSize: 11, padding: "4px 8px", background: "transparent", border: `1px solid ${surface.dividerBorder}`, borderRadius: 4, color: surface.placeholderText, cursor: "pointer" }}>✕</button>
        )}
      </div>
      {createError && (
        <div style={{ fontFamily: "Lato, sans-serif", fontSize: 10, color: "#ff7b7b" }}>⚠ {createError}</div>
      )}
      {kamiUrl && <div style={{ fontFamily: "Lato, sans-serif", fontSize: 10, color: surface.placeholderText, wordBreak: "break-all" }}>Linked: {kamiUrl}</div>}
    </div>
  );
}

function Section({ label, value, placeholder, editing, onStartEdit, onSave, rows = 3, minHeight, surface, itemized, checkedLines, onToggleLine, quickAddOptions, interactive = true, kamiUrl, onSaveKamiUrl, onKamiOpen, lessonLabel }) {
  const ref = useRef(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  // --- Itemized (Google-Keep-style checklist) editing --------------------
  // Agenda and Learning Goals no longer share the single big textarea at
  // all -- each line is its own row with its own checkbox and its own
  // auto-growing text box, so a goal that runs long just wraps under its
  // own text (the checkbox never repeats down the wrapped lines), Enter
  // splits off a new item at the cursor, and Backspace at the start of a
  // line merges it back into the one above -- the same feel as Google
  // Keep's checklist editor, which is what Jay asked to match.
  // `onToggleLine` is only ever handed to the one
  // interactive/front copy of a field (see EditableField and
  // FullAgendaFields above) -- every other copy renders the plain
  // read-only checklist below instead.
  const editable = itemized && typeof onToggleLine === "function";
  const [items, setItems] = useState(() => splitGoalLines(value));
  const lastSavedRef = useRef(value);
  const itemRefs = useRef([]);
  const pendingFocusRef = useRef(null);
  const [dragItemId, setDragItemId] = useState(null);
  const [draggingItems, setDraggingItems] = useState(null);

  // Re-sync from an externally-changed value (Reset Board, a Mongo-synced
  // update from another device, or a fresh lesson loading in) -- but never
  // when the change is just this component's own last save echoing back
  // through props, or every keystroke would fight the local item list.
  useEffect(() => {
    if (!itemized) return;
    if (value === lastSavedRef.current) return;
    lastSavedRef.current = value;
    setItems(splitGoalLines(value));
  }, [itemized, value]);

  const persistItems = (nextItems) => {
    const joined = nextItems.filter(t => t.trim().length > 0).join("\n");
    lastSavedRef.current = joined;
    onSave(joined);
  };

  const updateItems = (nextItems, focus) => {
    setItems(nextItems);
    persistItems(nextItems);
    if (focus) pendingFocusRef.current = focus;
  };

  // Auto-grow every row to fit its content (including on mount, when a
  // lesson loads with an already-long goal in it) and restore focus/caret
  // after an Enter-split or Backspace-merge, since the row list re-renders
  // from scratch each time.
  useLayoutEffect(() => {
    if (!editable) return;
    itemRefs.current.forEach(el => {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
    const pending = pendingFocusRef.current;
    if (pending) {
      pendingFocusRef.current = null;
      const el = itemRefs.current[pending.index];
      if (el) {
        el.focus();
        const pos = pending.caret ?? el.value.length;
        el.setSelectionRange(pos, pos);
      }
    }
  }, [items, editable]);

  const handleItemChange = (idx, text) => {
    const next = items.slice();
    next[idx] = text;
    setItems(next);
    persistItems(next);
  };

  const handleItemKeyDown = (idx, e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const el = e.target;
      const before = items[idx].slice(0, el.selectionStart);
      const after = items[idx].slice(el.selectionStart);
      const next = items.slice();
      next.splice(idx, 1, before, after);
      updateItems(next, { index: idx + 1, caret: 0 });
    } else if (e.key === "Backspace" && e.target.selectionStart === 0 && e.target.selectionEnd === 0) {
      if (idx === 0) return; // nothing above this to merge into
      e.preventDefault();
      const prevText = items[idx - 1];
      const merged = prevText + items[idx];
      const next = items.slice();
      next.splice(idx - 1, 2, merged);
      updateItems(next, { index: idx - 1, caret: prevText.length });
    }
  };

  // Optional `presetText` is what the Agenda's "+ Bell Ringer" / "+ Home
  // Learning" quick-add chips below pass in — a Bell Ringer or Home
  // Learning line, pre-filled from that field's own current content (or
  // just its label, if that field is still empty), so a teacher who wants
  // Bell Ringer to live as one more Agenda checklist line (Jay: "bellringer
  // is part of the agenda... but some teachers may not use the agenda
  // feature at all but they do use bell ringers") doesn't have to retype
  // it. The plain "Add item" row below still calls this with no argument.
  const addItem = (presetText = "") => {
    const next = [...items, presetText];
    updateItems(next, { index: next.length - 1, caret: presetText.length });
  };

  const removeItem = (idx) => {
    const next = items.slice();
    next.splice(idx, 1);
    const focusIdx = Math.max(0, idx - 1);
    updateItems(next, next.length ? { index: focusIdx, caret: next[focusIdx]?.length ?? 0 } : null);
  };
  // ------------------------------------------------------------------------

  const lines = (value || "").split("\n").filter(l => l.trim().length > 0);

  // On the live (non-build) board, hide the body entirely when there's no
  // content — nothing to show, no placeholder prompting the teacher to add
  // something (that belongs in Build mode only).
  if (!interactive) {
    const isEmpty = itemized
      ? items.filter(t => t.trim().length > 0).length === 0
      : lines.length === 0;
    if (isEmpty) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <SectionHeader label={label} surface={surface} onClick={!interactive && onKamiOpen && kamiUrl ? onKamiOpen : undefined} kamiIndicator={!interactive && !!kamiUrl && !!onKamiOpen} />
        </div>
      );
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SectionHeader label={label} surface={surface} onClick={!interactive && onKamiOpen && kamiUrl ? onKamiOpen : undefined} kamiIndicator={!interactive && !!kamiUrl && !!onKamiOpen} />
      {itemized ? (
        editable ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(draggingItems ?? items.map((text, i) => ({ id: i, text }))).map((item, displayIdx) => {
              const text = item.text;
              const id = item.id;
              const checked = !!(checkedLines && checkedLines[displayIdx]);
              const isDragging = dragItemId !== null && id === dragItemId;
              return (
                <div
                  key={id}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 2px", opacity: isDragging ? 0.4 : 1 }}
                  onDragOver={e => {
                    e.preventDefault();
                    if (dragItemId === null || !draggingItems || id === dragItemId) return;
                    const ls = [...draggingItems];
                    const from = ls.findIndex(d => d.id === dragItemId);
                    const to = ls.findIndex(d => d.id === id);
                    if (from !== -1 && to !== -1 && from !== to) {
                      const [mv] = ls.splice(from, 1);
                      ls.splice(to, 0, mv);
                      setDraggingItems(ls);
                    }
                  }}
                >
                  <div
                    draggable
                    onDragStart={e => {
                      e.stopPropagation();
                      setDragItemId(id);
                      setDraggingItems(items.map((t, i) => ({ id: i, text: t })));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      if (draggingItems) updateItems(draggingItems.map(d => d.text));
                      setDragItemId(null);
                      setDraggingItems(null);
                    }}
                    style={{ display: "flex", alignItems: "center", paddingTop: 4, paddingRight: 2, flexShrink: 0, cursor: "grab", color: "rgba(255,255,255,0.55)", fontSize: 15, userSelect: "none" }}
                  >≡</div>
                  <span
                    onClick={() => onToggleLine(displayIdx)}
                    style={{ width: 14, height: 14, marginTop: 5, borderRadius: 3, border: `2px solid ${checked ? surface.accent : surface.checkboxBorder}`, background: checked ? surface.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "all 0.15s" }}
                  >
                    {checked && <span style={{ color: "white", fontSize: 9, lineHeight: 1 }}>✓</span>}
                  </span>
                  <textarea
                    ref={el => { itemRefs.current[displayIdx] = el; }}
                    value={text}
                    rows={1}
                    onChange={e => {
                      if (draggingItems) return;
                      const next = items.slice();
                      next[id] = e.target.value;
                      setItems(next);
                      persistItems(next);
                    }}
                    onKeyDown={e => handleItemKeyDown(id, e)}
                    placeholder={displayIdx === 0 ? placeholder : ""}
                    style={{
                      flex: 1, minWidth: 0, resize: "none", overflow: "hidden", border: "none", outline: "none",
                      background: "transparent", fontFamily: "Caveat, cursive", fontSize: 17, lineHeight: 1.4,
                      color: checked ? surface.bodyTextChecked : surface.bodyText, textShadow: surface.textShadow,
                      textDecoration: checked ? "line-through" : "none", padding: 0, margin: 0,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(id)}
                    title="Remove"
                    style={{ background: "transparent", border: "none", color: surface.placeholderText, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 2px", flexShrink: 0, opacity: 0.6 }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = 0.6; }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <div
              onClick={() => addItem()}
              // "Add item," not "type text here" — cursor: pointer (was
              // "text", copy-pasted from the freeform click-to-edit field
              // below, but that one turns into a textarea on click while
              // this one just appends a new item and focuses it, so a
              // hand cursor communicates it correctly instead of implying
              // this row itself is typeable).
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px", cursor: "pointer", color: surface.placeholderText, fontFamily: "Caveat, cursive", fontSize: 16, fontStyle: items.length ? "normal" : "italic" }}
              onMouseEnter={e => { e.currentTarget.style.color = surface.accent; }}
              onMouseLeave={e => { e.currentTarget.style.color = surface.placeholderText; }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px dashed ${surface.checkboxBorder}`, flexShrink: 0 }} />
              {items.length ? "Add item" : placeholder}
            </div>
            {/* Agenda-only: quick-add chips that drop Bell Ringer/Home
                Learning in as one more line of this same checklist, pulling
                in whatever's already typed in that standalone field (or
                just its label, to edit, if it's empty) — for teachers who
                want Bell Ringer folded into one flat Agenda list (matching
                Jay's Google Keep reference) instead of, or alongside, its
                own separate board section. The standalone Bell Ringer/Home
                Learning sections aren't removed by this — some teachers
                skip Agenda entirely and just use those on their own. */}
            {quickAddOptions && quickAddOptions.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "2px 2px 0" }}>
                {quickAddOptions.map(opt => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => addItem(opt.value)}
                    title={`Add ${opt.label} as an agenda item`}
                    style={{ fontFamily: "Lato, sans-serif", fontSize: 11, letterSpacing: 0.3, color: surface.placeholderText, background: "transparent", border: `1px dashed ${surface.dividerBorder}`, borderRadius: 12, padding: "2px 10px", cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.color = surface.accent; e.currentTarget.style.borderColor = surface.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.color = surface.placeholderText; e.currentTarget.style.borderColor = surface.dividerBorder; }}
                  >
                    + {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          // Read-only itemized display -- the non-front copies of a
          // sliding-panel field, or anywhere this content shows without
          // edit rights.
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {lines.length === 0 ? (
              <div style={{ fontFamily: "Caveat, cursive", fontSize: 17, color: surface.placeholderText, fontStyle: "italic", padding: "2px 4px" }}>
                {placeholder}
              </div>
            ) : (
              lines.map((line, li) => {
                const checked = !!(checkedLines && checkedLines[li]);
                const canToggle = typeof onToggleLine === "function";
                return (
                  <div key={li} onClick={canToggle ? () => onToggleLine(li) : undefined}
                    style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 2px", cursor: canToggle ? "pointer" : "default" }}>
                    <span style={{ width: 14, height: 14, marginTop: 3, borderRadius: 3, border: `2px solid ${checked ? surface.accent : surface.checkboxBorder}`, background: checked ? surface.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                      {checked && <span style={{ color: "white", fontSize: 9, lineHeight: 1 }}>✓</span>}
                    </span>
                    <span style={{ fontFamily: "Caveat, cursive", fontSize: 17, lineHeight: 1.4, minWidth: 0, wordBreak: "break-word", color: checked ? surface.bodyTextChecked : surface.bodyText, textShadow: surface.textShadow, textDecoration: checked ? "line-through" : "none" }}>
                      {line}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )
      ) : editing ? (
        <textarea
          ref={ref}
          value={draft}
          rows={rows}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => onSave(draft)}
          onKeyDown={e => {
            if (e.key === "Escape") { setDraft(value); onSave(value); }
          }}
          style={{
            // Always a fixed dark color, NOT var(--board-primary) — this
            // box's own background is always this same near-white
            // regardless of a teacher's theme, so the text color has to
            // stay fixed too, or an arbitrary light primary color makes
            // whatever's typed here invisible (the original bug report:
            // "click to type, can't read/type anything").
            fontFamily: "Caveat, cursive", fontSize: 17, lineHeight: 1.4, color: "#1a1a1a",
            background: "rgba(255,255,255,0.92)", border: `2px solid ${surface.accent}`, borderRadius: 4,
            padding: 8, resize: "vertical", width: "100%", boxSizing: "border-box",
          }}
        />
      ) : (
        <div
          onClick={(!interactive && kamiUrl && onKamiOpen) ? onKamiOpen : onStartEdit}
          title={(!interactive && kamiUrl && onKamiOpen) ? "Tap to open Bell Ringer in Kami" : "Click to edit"}
          style={{
            fontFamily: "Caveat, cursive", fontSize: 17, lineHeight: 1.4,
            color: lines.length ? surface.bodyText : surface.placeholderText,
            textShadow: lines.length ? surface.textShadow : "none",
            fontStyle: lines.length ? "normal" : "italic",
            cursor: (!interactive && kamiUrl && onKamiOpen) ? "pointer" : "text",
            minHeight: minHeight ?? 24, padding: "2px 4px",
            borderRadius: 4, whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(128,128,128,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          {lines.length ? lines.join("\n") : placeholder}
        </div>
      )}
      {interactive && onSaveKamiUrl !== undefined && (
        <KamiUrlInput kamiUrl={kamiUrl} onSaveKamiUrl={onSaveKamiUrl} surface={surface} lessonLabel={lessonLabel} />
      )}
    </div>
  );
}

// Purely presentational — every bit of state comes from useFullAgendaFields
// via props, so this is safe to render more than once (e.g. once per
// sliding panel face) without any copy drifting out of sync: they're all
// just re-renders of the same underlying content.
//
// `interactive` (default true) controls whether THIS particular instance
// can be clicked into edit mode. When Sliding Boards is on, ChalkboardBoardRow
// mounts one FullAgendaFields per panel — same as it always has for the
// Learning Goals checklist — so the fields are baked into each physical
// board's own face and slide with it instead of popping in/out the
// instant the front board changes (see the comment on the ChalkboardBoardRow
// call site in WebsterGrovesChemistry.jsx for the fuller history). But
// every one of those instances shares the same editingKey; if any of them
// could enter edit mode, clicking one would flip every mounted copy into
// edit mode in the same render, and React focusing each new textarea in
// turn would blur-and-auto-save the others before a teacher could type
// (this happened for real — see Session 7 notes). Passing
// interactive={false} for every panel except the currently-front one
// keeps the content visible and physically attached to its own board
// while making sure only one instance can ever actually respond to a
// click.
// `showEssentialQuestion`/`showAgenda`/`showBellRinger`/`showHomeLearning`
// (all default true) are the per-component toggles from the Settings
// page's Board Content section (BOARD_COMPONENTS in boardConfig.js) — a
// teacher can turn any of these four off independently, so this only
// renders the ones actually switched on. Content for a hidden field isn't
// lost: it stays in `content`/localStorage untouched, so switching a
// component back on later shows whatever was there before.
// The "Reset Board" control on its own — pulled out of FullAgendaFields so
// the flat, reorderable board content column (WebsterGrovesChemistry.jsx)
// can place it once, independent of wherever Essential Question/Agenda/
// etc. land in a teacher's chosen order, rather than it being tied to a
// fixed position inside the all-four-fields block. Still used exactly as
// before, at the top of that block, when Sliding Boards is on.
export function ResetBoardButton({ onReset, surface = DEFAULT_SURFACE, interactive = true }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      {/* Always rendered — even on a non-interactive (non-front) panel —
          and hidden with visibility rather than left out of the tree.
          Conditionally not rendering it made this row collapse to zero
          height the instant a panel's interactive state flipped (which
          happens on every slide-handle click, for both the panel losing
          front status and the one gaining it), shifting every field
          below it up or down by the button's own height. visibility:
          hidden keeps the row's box — and therefore everything below it
          — exactly where it was, while still making the button
          untargetable by mouse or keyboard on a panel that shouldn't be
          interactive. */}
      <button
        onClick={interactive ? onReset : undefined}
        title="Reset this board to the default template"
        tabIndex={interactive ? 0 : -1}
        style={{
          fontFamily: "Lato, sans-serif", fontSize: 10, letterSpacing: 0.5, color: surface.placeholderText,
          background: "transparent", border: `1px solid ${surface.dividerBorder}`, borderRadius: 3, padding: "3px 8px",
          cursor: interactive ? "pointer" : "default",
          visibility: interactive ? "visible" : "hidden",
          pointerEvents: interactive ? "auto" : "none",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = surface.accent; e.currentTarget.style.borderColor = surface.accent; }}
        onMouseLeave={e => { e.currentTarget.style.color = surface.placeholderText; e.currentTarget.style.borderColor = surface.dividerBorder; }}
      >
        Reset Board
      </button>
    </div>
  );
}

export function FullAgendaFields({
  content, editingKey, onStartEdit, onSave, onReset, surface = DEFAULT_SURFACE, interactive = true,
  showEssentialQuestion = true, showAgenda = true, showBellRinger = true, showHomeLearning = true,
  checkedAgendaLines, onToggleAgendaLine,
}) {
  // Agenda's quick-add chips ("+ Bell Ringer" / "+ Home Learning") — see
  // the comment above them in Section. Computed here (not in Section
  // itself) since it needs the other three fields' current content, not
  // just Agenda's own.
  const agendaQuickAddOptions = [
    { label: FULL_AGENDA_FIELD_META.bellRinger.label, value: (content.bellRinger || "").trim() || FULL_AGENDA_FIELD_META.bellRinger.label },
    { label: FULL_AGENDA_FIELD_META.homeLearning.label, value: (content.homeLearning || "").trim() || FULL_AGENDA_FIELD_META.homeLearning.label },
  ];

  const section = (key, label, opts = {}) => (
    <Section
      label={label}
      value={content[key]}
      placeholder={opts.placeholder || "Click to add..."}
      editing={interactive && editingKey === key}
      onStartEdit={interactive ? () => onStartEdit(key) : undefined}
      onSave={val => onSave(key, val)}
      rows={opts.rows}
      minHeight={opts.minHeight}
      surface={surface}
      itemized={opts.itemized}
      checkedLines={key === "agenda" ? checkedAgendaLines : undefined}
      onToggleLine={key === "agenda" ? onToggleAgendaLine : undefined}
      quickAddOptions={key === "agenda" ? agendaQuickAddOptions : undefined}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <ResetBoardButton onReset={onReset} surface={surface} interactive={interactive} />
      {showEssentialQuestion && section("essentialQuestion", FULL_AGENDA_FIELD_META.essentialQuestion.label, FULL_AGENDA_FIELD_META.essentialQuestion)}
      {showAgenda && section("agenda", FULL_AGENDA_FIELD_META.agenda.label, FULL_AGENDA_FIELD_META.agenda)}
      {showBellRinger && section("bellRinger", FULL_AGENDA_FIELD_META.bellRinger.label, FULL_AGENDA_FIELD_META.bellRinger)}
      {showHomeLearning && section("homeLearning", FULL_AGENDA_FIELD_META.homeLearning.label, FULL_AGENDA_FIELD_META.homeLearning)}
    </div>
  );
}

// A single freeform field, standalone — same click-to-edit Section
// underneath FullAgendaFields uses, just one at a time instead of all
// four in a fixed block. This is what lets BOTH the flat (non-sliding)
// board content column AND ChalkboardBoardRow's sliding panels render
// Essential Question/Agenda/Bell Ringer/Home Learning in whatever order a
// teacher has chosen (see BOARD_CONTENT_ORDER_STORAGE_KEY in
// boardConfig.js) instead of a fixed sequence.
//
// `interactive` (default true) mirrors Section's own gate, and exists for
// exactly the reason FullAgendaFields' `interactive` prop does: when
// Sliding Boards is on, ChalkboardBoardRow mounts one EditableField per
// panel per key (baked into each board's own face so it slides
// physically, same as the goals checklist), all reading the same
// editingKey — only the current front panel's copy may actually enter
// edit mode, or clicking one would flip every mounted copy into edit mode
// in the same render. The flat (non-sliding) column only ever mounts one
// copy of each field, so it never needs to pass this.
export function EditableField({ fieldKey, content, editingKey, onStartEdit, onSave, surface = DEFAULT_SURFACE, interactive = true, checkedLines, onToggleLine, kamiUrl, onSaveKamiUrl, onKamiOpen, lessonLabel }) {
  const meta = FULL_AGENDA_FIELD_META[fieldKey];
  if (!meta) return null;
  // Same Agenda-only quick-add chips as FullAgendaFields' section() helper
  // — see the comment on them in Section. This is the path the flat,
  // reorderable board-content column (and Sliding Boards' per-panel
  // copies) render through, so it needs its own copy of that logic.
  const quickAddOptions = fieldKey === "agenda" ? [
    { label: FULL_AGENDA_FIELD_META.bellRinger.label, value: (content.bellRinger || "").trim() || FULL_AGENDA_FIELD_META.bellRinger.label },
    { label: FULL_AGENDA_FIELD_META.homeLearning.label, value: (content.homeLearning || "").trim() || FULL_AGENDA_FIELD_META.homeLearning.label },
  ] : undefined;
  return (
    <Section
      label={meta.label}
      value={content[fieldKey]}
      placeholder={meta.placeholder}
      editing={interactive && editingKey === fieldKey}
      onStartEdit={interactive ? () => onStartEdit(fieldKey) : undefined}
      onSave={val => onSave(fieldKey, val)}
      rows={meta.rows}
      surface={surface}
      itemized={meta.itemized}
      interactive={interactive}
      checkedLines={checkedLines}
      onToggleLine={onToggleLine}
      quickAddOptions={quickAddOptions}
      kamiUrl={kamiUrl}
      onSaveKamiUrl={onSaveKamiUrl}
      onKamiOpen={onKamiOpen}
      lessonLabel={lessonLabel}
    />
  );
}

// Objectives & Benchmarks — not a free-text field. Renders the same
// Learning Goals checklist (same items, same checked state, same toggle)
// the Simple Goals template shows, so the content lives in one place.
// Used for the non-sliding Full Agenda case; when Sliding Boards is on,
// ChalkboardBoardRow renders the checklist itself (per docked panel)
// instead, with `goalsLabel="Objectives & Benchmarks"`.
export function ObjectivesChecklist({ goalItems, checkedGoals, toggleGoal, surface = DEFAULT_SURFACE, label = "Objectives & Benchmarks", interactive = true }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SectionHeader label={label} surface={surface} />
      {goalItems.length === 0 ? (
        interactive ? (
        <div style={{ fontFamily: "Caveat, cursive", fontSize: 17, color: surface.placeholderText, fontStyle: "italic", padding: "2px 4px" }}>
          No learning goals set for this lesson yet.
        </div>
        ) : null
      ) : (
        goalItems.map(({ text, panelKey, idx }) => {
          const key = `${panelKey}-${idx}`;
          const checked = checkedGoals[key];
          return (
            <div key={key} onClick={() => toggleGoal(panelKey, idx)}
              style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "4px 0" }}>
              <div style={{ width: 15, height: 15, border: `2px solid ${checked ? surface.accent : surface.checkboxBorder}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, background: checked ? surface.accent : "transparent", transition: "all 0.15s" }}>
                {checked && <span style={{ color: "white", fontSize: 9, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ fontFamily: "Caveat, cursive", fontSize: 15, color: checked ? surface.bodyTextChecked : surface.bodyText, lineHeight: 1.35, textShadow: surface.textShadow, textDecoration: checked ? "line-through" : "none", minWidth: 0, wordBreak: "break-word" }}>
                {text}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

// Convenience wrapper for the non-sliding case: owns its own field state
// via the hook (fine here since it's only ever rendered once) and
// combines the Objectives checklist with the freeform fields, stacked in
// a single column — the same slot the Simple Goals checklist occupies.
export default function FullAgendaBoard({ storageKey, goalItems, checkedGoals, toggleGoal, surface = DEFAULT_SURFACE }) {
  const { content, editingKey, setEditingKey, save, resetToDefaults } = useFullAgendaFields(storageKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <ObjectivesChecklist goalItems={goalItems} checkedGoals={checkedGoals} toggleGoal={toggleGoal} surface={surface} />
      <FullAgendaFields
        content={content}
        editingKey={editingKey}
        onStartEdit={setEditingKey}
        onSave={save}
        onReset={resetToDefaults}
        surface={surface}
      />
    </div>
  );
}
