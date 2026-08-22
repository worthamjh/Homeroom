import { useState, useEffect, useRef } from "react";

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
    agenda: "Per. 1 - \nPer. 2 - \nPer. 3 - \nPer. 4 - ",
    bellRinger: "",
    homeLearning: "",
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

const DEFAULT_SURFACE = { accent: "#E87722", headerText: "#E87722", bodyText: "rgba(255,255,255,0.88)", bodyTextChecked: "rgba(255,255,255,0.3)", placeholderText: "rgba(255,255,255,0.4)", dividerBorder: "rgba(255,255,255,0.2)", textShadow: "1px 1px 2px rgba(0,0,0,0.5)", checkboxBorder: "rgba(255,255,255,0.4)" };

// Single source of truth for Full Agenda's freeform field content. Call
// this ONCE per active lesson (in WebsterGrovesChemistry.jsx's App()),
// never inside something that gets rendered multiple times (like a
// per-panel component), or independent copies of "content" would drift
// out of sync with each other as a teacher edits.
export function useFullAgendaFields(storageKey) {
  const [content, setContent] = useState(() => loadContent(storageKey));
  const [editingKey, setEditingKey] = useState(null);

  // Reload (keeping any prior edits for *this* lesson) whenever the
  // storage key changes — i.e. the teacher navigated to a different lesson.
  useEffect(() => {
    setContent(loadContent(storageKey));
    setEditingKey(null);
  }, [storageKey]);

  const save = (key, value) => {
    setEditingKey(null);
    setContent(prev => {
      const next = { ...prev, [key]: value };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  };

  const resetToDefaults = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset this board back to the default template for this lesson? Your edits will be lost.")) return;
    const fresh = defaultFullAgendaContent();
    setContent(fresh);
    setEditingKey(null);
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  };

  return { content, editingKey, setEditingKey, save, resetToDefaults };
}

// One section = a header + a body that's either rendered text (bulleted,
// one line per non-empty row) or, while editing, a textarea. Shared by
// every freely-editable field below so the click-to-edit behavior is
// consistent.
function Section({ label, value, placeholder, editing, onStartEdit, onSave, rows = 3, minHeight, surface }) {
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

  const lines = (value || "").split("\n").filter(l => l.trim().length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: surface.accent, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: 6 }}>
        {label}
      </div>
      {editing ? (
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
            fontFamily: "Caveat, cursive", fontSize: 17, lineHeight: 1.4, color: "#1a1a1a",
            background: "rgba(255,255,255,0.92)", border: `2px solid ${surface.accent}`, borderRadius: 4,
            padding: 8, resize: "vertical", width: "100%", boxSizing: "border-box",
          }}
        />
      ) : (
        <div
          onClick={onStartEdit}
          title="Click to edit"
          style={{
            fontFamily: "Caveat, cursive", fontSize: 17, lineHeight: 1.4,
            color: lines.length ? surface.bodyText : surface.placeholderText,
            textShadow: lines.length ? surface.textShadow : "none",
            fontStyle: lines.length ? "normal" : "italic",
            cursor: "text", minHeight: minHeight ?? 24, padding: "2px 4px",
            borderRadius: 4, whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(128,128,128,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          {lines.length ? lines.join("\n") : placeholder}
        </div>
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
export function FullAgendaFields({
  content, editingKey, onStartEdit, onSave, onReset, surface = DEFAULT_SURFACE, interactive = true,
  showEssentialQuestion = true, showAgenda = true, showBellRinger = true, showHomeLearning = true,
}) {
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
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
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
      {showEssentialQuestion && section("essentialQuestion", "Essential Question", { placeholder: "Click to add today’s essential question...", rows: 2 })}
      {showAgenda && section("agenda", "Agenda", { placeholder: "Click to add the agenda by period...", rows: 5 })}
      {showBellRinger && section("bellRinger", "Bell Ringer", { placeholder: "Click to add a bell ringer / warm-up...", rows: 2 })}
      {showHomeLearning && section("homeLearning", "Home Learning", { placeholder: "Click to add homework / home learning...", rows: 2 })}
    </div>
  );
}

// Objectives & Benchmarks — not a free-text field. Renders the same
// Learning Goals checklist (same items, same checked state, same toggle)
// the Simple Goals template shows, so the content lives in one place.
// Used for the non-sliding Full Agenda case; when Sliding Boards is on,
// ChalkboardBoardRow renders the checklist itself (per docked panel)
// instead, with `goalsLabel="Objectives & Benchmarks"`.
export function ObjectivesChecklist({ goalItems, checkedGoals, toggleGoal, surface = DEFAULT_SURFACE, label = "Objectives & Benchmarks" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: surface.accent, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: 6 }}>
        {label}
      </div>
      {goalItems.length === 0 ? (
        <div style={{ fontFamily: "Caveat, cursive", fontSize: 17, color: surface.placeholderText, fontStyle: "italic", padding: "2px 4px" }}>
          No learning goals set for this lesson yet.
        </div>
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
