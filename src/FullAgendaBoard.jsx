import { useState, useEffect, useRef } from "react";
import { buildSlidingPanels } from "./boardConfig";

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
 * Props:
 *   storageKey: string — already fully scoped (user + lesson), for the
 *     freely-editable fields below.
 *   goalItems: Array<{ text: string, panelKey: string, idx: number }> —
 *     the lesson's goals, pre-flattened by the caller (handles both plain
 *     `goals` lessons and Unit 10's multi-panel `goalPanels` lessons).
 *   checkedGoals: object, toggleGoal: (panelKey, idx) => void — the same
 *     shared state the Learning Goals checklist / sliding chalkboard use,
 *     so checking a goal here stays in sync with those views too.
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

// One section = a header + a body that's either rendered text (bulleted,
// one line per non-empty row) or, while editing, a textarea. Shared by
// every freely-editable field below so the click-to-edit behavior is
// consistent.
const DEFAULT_SURFACE = { accent: "#E87722", headerText: "#E87722", bodyText: "rgba(255,255,255,0.88)", bodyTextChecked: "rgba(255,255,255,0.3)", placeholderText: "rgba(255,255,255,0.4)", dividerBorder: "rgba(255,255,255,0.2)", textShadow: "1px 1px 2px rgba(0,0,0,0.5)", checkboxBorder: "rgba(255,255,255,0.4)" };

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

// Objectives & Benchmarks — not a free-text field. Renders the same
// Learning Goals checklist (same items, same checked state, same toggle)
// the Simple Goals template shows, so the content lives in one place.
// Used directly (flat, no panels) when Sliding Boards is off; when it's
// on, SlidingObjectivesPanel (below) takes over instead.
function ObjectivesChecklist({ goalItems, checkedGoals, toggleGoal, surface }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: surface.accent, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: 6 }}>
        Objectives & Benchmarks
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

// The real sliding-board motion for Objectives & Benchmarks — a bounded
// box (not the whole chalkboard row, since Full Agenda's other fields sit
// in normal flow below it) where each panel is a physical slab that
// actually slides horizontally, matching ChalkboardBoardRow's look
// (metal frame, drop shadow) rather than a text counter with arrows.
// Panels are pre-split by buildSlidingPanels so a given lesson's goals
// land in the same panels as the Simple Goals content template's sliding
// chalkboard.
function SlidingObjectivesPanel({ panels, checkedGoals, toggleGoal, surface }) {
  const [current, setCurrent] = useState(0);
  const count = panels.length;
  const goTo = (i) => setCurrent(((i % count) + count) % count);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: surface.accent, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Objectives & Benchmarks</span>
        <span style={{ fontFamily: "Lato, sans-serif", fontSize: 11, color: surface.placeholderText, textTransform: "none", letterSpacing: 0 }}>
          {current + 1}/{count}
        </span>
      </div>

      <div style={{ position: "relative", height: 190, overflow: "hidden" }}>
        {panels.map((panel, i) => {
          const offset = i - current;
          const isCurrent = offset === 0;
          return (
            <div
              key={panel.panelKey ? `${panel.panelKey}-${i}` : i}
              style={{
                position: "absolute", inset: 0,
                transform: `translateX(${offset * 106}%)`,
                transition: "transform 550ms cubic-bezier(0.4, 0, 0.2, 1)",
                background: `
                  radial-gradient(ellipse 70px 18px at 22% 25%, rgba(255,255,255,0.05), transparent 70%),
                  radial-gradient(ellipse 90px 16px at 68% 55%, rgba(255,255,255,0.04), transparent 70%),
                  ${surface.face}
                `,
                border: "9px solid #9a9a9a",
                borderRadius: 4,
                boxSizing: "border-box",
                boxShadow: isCurrent ? "0 5px 14px rgba(0,0,0,0.4), inset 0 0 0 10px #9a9a9a" : "inset 0 0 0 10px #9a9a9a",
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                overflowY: "auto",
                zIndex: isCurrent ? 2 : 1,
              }}
            >
              {panel.goals.map((goalItem, gi) => {
                const isIndexed = goalItem && typeof goalItem === "object";
                const text = isIndexed ? goalItem.text : goalItem;
                const idx = isIndexed ? goalItem.idx : gi;
                const key = `${panel.panelKey}-${idx}`;
                const checked = checkedGoals[key];
                return (
                  <div key={idx} onClick={() => toggleGoal(panel.panelKey, idx)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "2px 0" }}>
                    <div style={{ width: 14, height: 14, border: `2px solid ${checked ? surface.accent : surface.checkboxBorder}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, background: checked ? surface.accent : "transparent", transition: "all 0.15s" }}>
                      {checked && <span style={{ color: "white", fontSize: 8, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontFamily: "Caveat, cursive", fontSize: 14, color: checked ? surface.bodyTextChecked : surface.bodyText, lineHeight: 1.3, textShadow: surface.textShadow, textDecoration: checked ? "line-through" : "none", minWidth: 0, wordBreak: "break-word" }}>
                      {text}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Handle strip — click either side to slide a board over, same
          "pull the board along a rail" affordance as the Simple Goals
          sliding chalkboard, sized for this narrower single-column box. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 2 }}>
        <button
          onClick={() => goTo(current - 1)}
          title="Previous board"
          style={{ width: 26, height: 18, borderRadius: 3, border: `2px solid ${surface.accent}`, background: "#c9622b", boxShadow: "0 2px 5px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <span aria-hidden="true" style={{ fontSize: 11, lineHeight: 1, color: "rgba(0,0,0,0.55)", fontWeight: 700 }}>‹</span>
        </button>
        {panels.map((_, i) => (
          <span
            key={i}
            onClick={() => goTo(i)}
            style={{ width: 7, height: 7, borderRadius: "50%", cursor: "pointer", background: i === current ? surface.accent : surface.checkboxBorder }}
          />
        ))}
        <button
          onClick={() => goTo(current + 1)}
          title="Next board"
          style={{ width: 26, height: 18, borderRadius: 3, border: `2px solid ${surface.accent}`, background: "#c9622b", boxShadow: "0 2px 5px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <span aria-hidden="true" style={{ fontSize: 11, lineHeight: 1, color: "rgba(0,0,0,0.55)", fontWeight: 700 }}>›</span>
        </button>
      </div>
    </div>
  );
}

export default function FullAgendaBoard({ storageKey, goalItems, checkedGoals, toggleGoal, surface = DEFAULT_SURFACE, slidingEnabled = false, slidingCount = 3 }) {
  const [content, setContent] = useState(() => loadContent(storageKey));
  const [editingKey, setEditingKey] = useState(null);

  // Reload (keeping any prior edits for *this* lesson) whenever the
  // storage key changes — i.e. the teacher navigated to a different lesson.
  useEffect(() => {
    setContent(loadContent(storageKey));
    setEditingKey(null);
  }, [storageKey]);

  // Sliding Boards, applied to the Objectives & Benchmarks checklist only
  // (the rest of Full Agenda — Essential Question, Agenda, Bell Ringer,
  // Home Learning — is freeform text, not panel content, so it stays put
  // regardless of this setting). Same buildSlidingPanels split used by the
  // Simple Goals content template's sliding chalkboard, so a given lesson's
  // goals land in the same panels either way — real physical-board slide
  // motion via SlidingObjectivesPanel, not a text pager.
  const panels = slidingEnabled ? buildSlidingPanels(goalItems, slidingCount) : null;
  const showSliding = !!(panels && panels.length > 1);

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

  const section = (key, label, opts = {}) => (
    <Section
      label={label}
      value={content[key]}
      placeholder={opts.placeholder || "Click to add..."}
      editing={editingKey === key}
      onStartEdit={() => setEditingKey(key)}
      onSave={val => save(key, val)}
      rows={opts.rows}
      minHeight={opts.minHeight}
      surface={surface}
    />
  );

  // Single stacked column — this renders inside the same goals-column slot
  // the Simple Goals checklist occupies (alongside the SmartBoard/slides,
  // not instead of it), so it needs to work at that narrower width rather
  // than a wide two-column layout.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={resetToDefaults}
          title="Reset this board to the default template"
          style={{ fontFamily: "Lato, sans-serif", fontSize: 10, letterSpacing: 0.5, color: surface.placeholderText, background: "transparent", border: `1px solid ${surface.dividerBorder}`, borderRadius: 3, padding: "3px 8px", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.color = surface.accent; e.currentTarget.style.borderColor = surface.accent; }}
          onMouseLeave={e => { e.currentTarget.style.color = surface.placeholderText; e.currentTarget.style.borderColor = surface.dividerBorder; }}
        >
          Reset Board
        </button>
      </div>

      {showSliding ? (
        <SlidingObjectivesPanel key={storageKey} panels={panels} checkedGoals={checkedGoals} toggleGoal={toggleGoal} surface={surface} />
      ) : (
        <ObjectivesChecklist goalItems={goalItems} checkedGoals={checkedGoals} toggleGoal={toggleGoal} surface={surface} />
      )}
      {section("essentialQuestion", "Essential Question", { placeholder: "Click to add today’s essential question...", rows: 2 })}
      {section("agenda", "Agenda", { placeholder: "Click to add the agenda by period...", rows: 5 })}
      {section("bellRinger", "Bell Ringer", { placeholder: "Click to add a bell ringer / warm-up...", rows: 2 })}
      {section("homeLearning", "Home Learning", { placeholder: "Click to add homework / home learning...", rows: 2 })}
    </div>
  );
}
