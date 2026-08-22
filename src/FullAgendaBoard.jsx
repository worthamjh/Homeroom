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
//
// When Sliding Boards is on, `pager` is passed with { panelIdx, panelCount,
// onPrev, onNext } and only the current panel's items render — mirroring
// the sliding chalkboard (ChalkboardBoardRow) so the same setting behaves
// consistently whether a lesson is showing Simple Goals or Full Agenda.
function ObjectivesChecklist({ goalItems, checkedGoals, toggleGoal, surface, pager }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: surface.accent, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Objectives & Benchmarks</span>
        {pager && pager.panelCount > 1 && (
          <span style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none", letterSpacing: 0 }}>
            <button
              onClick={pager.onPrev}
              title="Previous board"
              style={{ background: "transparent", border: "none", color: surface.accent, fontSize: 14, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
            >
              ‹
            </button>
            <span style={{ fontFamily: "Lato, sans-serif", fontSize: 11, color: surface.placeholderText }}>
              {pager.panelIdx + 1}/{pager.panelCount}
            </span>
            <button
              onClick={pager.onNext}
              title="Next board"
              style={{ background: "transparent", border: "none", color: surface.accent, fontSize: 14, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
            >
              ›
            </button>
          </span>
        )}
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

export default function FullAgendaBoard({ storageKey, goalItems, checkedGoals, toggleGoal, surface = DEFAULT_SURFACE, slidingEnabled = false, slidingCount = 3 }) {
  const [content, setContent] = useState(() => loadContent(storageKey));
  const [editingKey, setEditingKey] = useState(null);
  const [panelIdx, setPanelIdx] = useState(0);

  // Reload (keeping any prior edits for *this* lesson) whenever the
  // storage key changes — i.e. the teacher navigated to a different lesson.
  useEffect(() => {
    setContent(loadContent(storageKey));
    setEditingKey(null);
    setPanelIdx(0);
  }, [storageKey]);

  // Sliding Boards, applied to the Objectives & Benchmarks checklist only
  // (the rest of Full Agenda — Essential Question, Agenda, Bell Ringer,
  // Home Learning — is freeform text, not panel content, so it stays put
  // regardless of this setting). Same buildSlidingPanels split used by the
  // Simple Goals content template's sliding chalkboard, so a given lesson's
  // goals land in the same panels either way.
  const panels = slidingEnabled ? buildSlidingPanels(goalItems, slidingCount) : null;
  const panelCount = panels ? panels.length : 0;
  const clampedPanelIdx = panelCount > 0 ? Math.min(panelIdx, panelCount - 1) : 0;
  const visibleGoalItems = panels && panels.length > 0
    ? panels[clampedPanelIdx].goals.map(g => ({ text: g.text, panelKey: panels[clampedPanelIdx].panelKey, idx: g.idx }))
    : goalItems;
  const pager = panels ? {
    panelIdx: clampedPanelIdx,
    panelCount,
    onPrev: () => setPanelIdx(i => (i - 1 + panelCount) % panelCount),
    onNext: () => setPanelIdx(i => (i + 1) % panelCount),
  } : null;

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

      <ObjectivesChecklist goalItems={visibleGoalItems} checkedGoals={checkedGoals} toggleGoal={toggleGoal} surface={surface} pager={pager} />
      {section("essentialQuestion", "Essential Question", { placeholder: "Click to add today’s essential question...", rows: 2 })}
      {section("agenda", "Agenda", { placeholder: "Click to add the agenda by period...", rows: 5 })}
      {section("bellRinger", "Bell Ringer", { placeholder: "Click to add a bell ringer / warm-up...", rows: 2 })}
      {section("homeLearning", "Home Learning", { placeholder: "Click to add homework / home learning...", rows: 2 })}
    </div>
  );
}
