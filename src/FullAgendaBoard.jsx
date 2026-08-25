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

const DEFAULT_SURFACE = { accent: "var(--board-secondary-accent)", headerText: "var(--board-secondary-accent)", bodyText: "rgba(255,255,255,0.88)", bodyTextChecked: "rgba(255,255,255,0.3)", placeholderText: "rgba(255,255,255,0.4)", dividerBorder: "rgba(255,255,255,0.2)", textShadow: "1px 1px 2px rgba(0,0,0,0.5)", checkboxBorder: "rgba(255,255,255,0.4)" };

// Single source of truth for Full Agenda's freeform field content. Call
// this ONCE per active lesson (in WebsterGrovesChemistry.jsx's App()),
// never inside something that gets rendered multiple times (like a
// per-panel component), or independent copies of "content" would drift
// out of sync with each other as a teacher edits.
export function useFullAgendaFields(storageKey) {
  const [content, setContent] = useState(() => loadContent(storageKey));
  const [editingKey, setEditingKey] = useState(null);
  const [checkedAgendaLines, setCheckedAgendaLines] = useState(() => loadAgendaChecked(storageKey));

  // Reload (keeping any prior edits for *this* lesson) whenever the
  // storage key changes — i.e. the teacher navigated to a different lesson.
  useEffect(() => {
    setContent(loadContent(storageKey));
    setEditingKey(null);
    setCheckedAgendaLines(loadAgendaChecked(storageKey));
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

  // Toggles one Agenda line's checked state by its position in the
  // (non-empty-line-filtered) list — independent of `content.agenda`
  // itself, since checking an item shouldn't count as editing the text.
  const toggleAgendaLine = (lineIdx) => {
    setCheckedAgendaLines(prev => {
      const next = { ...prev, [lineIdx]: !prev[lineIdx] };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(agendaCheckedKey(storageKey), JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  };

  const resetToDefaults = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset this board back to the default template for this lesson? Your edits will be lost.")) return;
    const fresh = defaultFullAgendaContent();
    setContent(fresh);
    setEditingKey(null);
    setCheckedAgendaLines({});
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey);
        window.localStorage.removeItem(agendaCheckedKey(storageKey));
      } catch { /* ignore */ }
    }
  };

  return { content, editingKey, setEditingKey, save, resetToDefaults, checkedAgendaLines, toggleAgendaLine };
}

// The one header style shared by EVERY board content section — Essential
// Question, Agenda, Bell Ringer, Home Learning, and Objectives &
// Benchmarks/Learning Goals all render through this SAME function rather
// than each having its own copy of the same style object, specifically so
// they can never visually drift apart from each other again (Jay caught a
// case where Objectives' heading looked different from the others').
function SectionHeader({ label, surface }) {
  return (
    <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: surface.accent, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: 6 }}>
      {label}
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
  agenda: { label: "Agenda", placeholder: "Click to add the agenda by period...", rows: 5, itemized: true },
  bellRinger: { label: "Bell Ringer", placeholder: "Click to add a bell ringer / warm-up...", rows: 2 },
  homeLearning: { label: "Home Learning", placeholder: "Click to add homework / home learning...", rows: 2 },
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
function Section({ label, value, placeholder, editing, onStartEdit, onSave, rows = 3, minHeight, surface, itemized, checkedLines, onToggleLine }) {
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
      <SectionHeader label={label} surface={surface} />
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
      ) : itemized && lines.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {lines.map((line, li) => {
            const checked = !!(checkedLines && checkedLines[li]);
            return (
              <div
                key={li}
                onClick={(e) => { e.stopPropagation(); onToggleLine?.(li); }}
                style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "3px 2px", userSelect: "none", WebkitUserSelect: "none" }}
              >
                <span style={{ width: 14, height: 14, marginTop: 3, borderRadius: 3, border: `2px solid ${checked ? surface.accent : surface.checkboxBorder}`, background: checked ? surface.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                  {checked && <span style={{ color: "white", fontSize: 9, lineHeight: 1 }}>✓</span>}
                </span>
                <span style={{
                  fontFamily: "Caveat, cursive", fontSize: 17, lineHeight: 1.4, minWidth: 0, wordBreak: "break-word",
                  color: checked ? surface.bodyTextChecked : surface.bodyText, textShadow: surface.textShadow,
                  textDecoration: checked ? "line-through" : "none",
                }}>
                  {line}
                </span>
              </div>
            );
          })}
          {/* A small, deliberately low-key affordance to re-open the
              textarea — the checkbox rows above swallow clicks (via
              stopPropagation) so checking an item off never accidentally
              starts editing, which means the itemized view needs its own
              explicit way back into edit mode instead of "click anywhere"
              like the plain-text sections still use. */}
          <div
            onClick={onStartEdit}
            title="Click to edit"
            style={{ fontFamily: "Lato, sans-serif", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: surface.placeholderText, cursor: "pointer", padding: "4px 2px 0" }}
            onMouseEnter={e => { e.currentTarget.style.color = surface.accent; }}
            onMouseLeave={e => { e.currentTarget.style.color = surface.placeholderText; }}
          >
            Edit
          </div>
        </div>
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
      onToggleLine={interactive && key === "agenda" ? onToggleAgendaLine : undefined}
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
export function EditableField({ fieldKey, content, editingKey, onStartEdit, onSave, surface = DEFAULT_SURFACE, interactive = true, checkedLines, onToggleLine }) {
  const meta = FULL_AGENDA_FIELD_META[fieldKey];
  if (!meta) return null;
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
      checkedLines={checkedLines}
      onToggleLine={interactive ? onToggleLine : undefined}
    />
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
      <SectionHeader label={label} surface={surface} />
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
