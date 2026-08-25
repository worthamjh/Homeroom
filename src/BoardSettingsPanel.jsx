import { useState } from "react";
import {
  useScopedSetting,
  BOARD_ARRANGEMENTS, DEFAULT_ARRANGEMENT, ARRANGEMENT_STORAGE_KEY,
  BULLETIN_STYLES, DEFAULT_BULLETIN, BULLETIN_STORAGE_KEY,
  BOARD_COMPONENTS, useBoardContentOrder,
  WALL_TYPES, DEFAULT_WALL_TYPE, WALL_TYPE_STORAGE_KEY,
  WALL_COLORS, DEFAULT_WALL_COLOR_BY_TYPE, WALL_COLOR_STORAGE_KEY,
  wallColorSwatch,
  BOARD_SURFACES, DEFAULT_BOARD_SURFACE, BOARD_SURFACE_STORAGE_KEY,
  SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED,
  SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, SLIDING_BOARDS_COUNT_OPTIONS,
} from "./boardConfig";

/**
 * BoardSettingsPanel — the categorized board-formatting controls
 * (Background, Board Layout, Bulletin Board, Board Content, Blackboard),
 * factored out of what used to be the standalone SettingsPage.jsx so
 * BuildPage.jsx can render it alongside the live editable board instead of
 * teachers needing two separate pages for "how the board looks" vs. "what
 * content is on it" (Jay's ask — one Build page, not a Build page AND a
 * Settings page). SettingsPage.jsx itself is now just a redirect to
 * /build for anyone with the old URL bookmarked/muscle-memorized.
 *
 * `selected`/`onSelect` are lifted to the caller (rather than owned here)
 * because the caller also needs to know which category is expanded in
 * order to postMessage a "homeroom-settings-highlight" into its live
 * preview iframe — same mechanism this panel always used, just now the
 * iframe it's highlighting is Build's interactive one instead of
 * Settings' read-only one (see the isBuildMode-gated listener in
 * WebsterGrovesChemistry.jsx).
 *
 * Every setting here is a "cross-tab-synced setting" (useScopedSetting,
 * see boardConfig.js): persisted to the same scoped localStorage keys the
 * board reads, and picked up live by any open board tab — including this
 * same page's own embedded preview — via the browser's `storage` event.
 */

export const BOARD_SETTINGS_CATEGORIES = [
  { id: "background", label: "Background", blurb: "The classroom wall behind the board." },
  { id: "layout", label: "Board Layout", blurb: "Which side the slides sit on." },
  { id: "bulletin", label: "Bulletin Board", blurb: "The strip above the board." },
  { id: "content", label: "Board Content", blurb: "What's written on the board itself." },
  { id: "blackboard", label: "Blackboard", blurb: "Surface look, and sliding boards." },
];

function RadioRow({ selected, onClick, label, swatch }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: "10px 14px", fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: selected ? "var(--board-secondary)" : "#ccc", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderRadius: 5 }}
      onMouseEnter={e => { e.currentTarget.style.background = "#242424"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      {swatch ? swatch : (
        <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${selected ? "var(--board-secondary)" : "rgba(255,255,255,0.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {selected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--board-secondary)" }} />}
        </span>
      )}
      {label}
    </div>
  );
}

// Board Content is a set of independent on/off switches (any combination
// can be on at once), unlike every other category here which is a
// single-choice preset — so it gets its own checkbox-style row instead of
// reusing RadioRow's single-selection radio-button look. The ☰ handle on
// the left is a native HTML5 drag handle (see the drag state/handlers in
// BoardSettingsPanel below) — a real drag-to-reorder interaction rather
// than click-to-move-one-step arrows, since dragging a row to exactly
// where it belongs is the more direct, obvious gesture once there's more
// than a one-step move to make.
function ToggleRow({ checked, onClick, label, draggable, onDragStart, onDragOver, onDrop, onDragEnd, isDragging, isDropTarget }) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        padding: "6px 14px 6px 6px", display: "flex", alignItems: "center", gap: 6, borderRadius: 5,
        opacity: isDragging ? 0.4 : 1,
        outline: isDropTarget ? "2px dashed var(--board-secondary)" : "none",
        outlineOffset: -2,
      }}
      onMouseEnter={e => { if (!isDropTarget) e.currentTarget.style.background = "#242424"; }}
      onMouseLeave={e => { if (!isDropTarget) e.currentTarget.style.background = "transparent"; }}
    >
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title="Drag to reorder"
        style={{
          width: 20, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          cursor: "grab", color: "rgba(255,255,255,0.35)", fontSize: 14, letterSpacing: 1,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "var(--board-secondary)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
      >
        ☰
      </div>
      <div
        onClick={onClick}
        style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: checked ? "var(--board-secondary)" : "#ccc", cursor: "pointer", padding: "4px 0", minWidth: 0 }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${checked ? "var(--board-secondary)" : "rgba(255,255,255,0.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: checked ? "var(--board-secondary)" : "transparent" }}>
          {checked && <span style={{ color: "var(--board-primary)", fontSize: 10, lineHeight: 1, fontWeight: 900 }}>✓</span>}
        </span>
        {label}
      </div>
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 1.5, textTransform: "uppercase", padding: "12px 14px 4px" }}>
      {children}
    </div>
  );
}

// Moves `fromKey` to sit where `toKey` currently is — a real reorder
// (splice out, splice back in at the target's position), not a swap, so
// dragging one row past several others in one motion works the way it
// looks like it should rather than only ever trading places with its
// immediate neighbor.
function reorder(order, fromKey, toKey) {
  if (fromKey === toKey) return order;
  const from = order.indexOf(fromKey);
  const to = order.indexOf(toKey);
  if (from === -1 || to === -1) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, fromKey);
  return next;
}

export default function BoardSettingsPanel({ selected, onSelect, panelCountInfo }) {
  const [arrangementKey, setArrangementKey] = useScopedSetting(ARRANGEMENT_STORAGE_KEY, DEFAULT_ARRANGEMENT, k => !!BOARD_ARRANGEMENTS[k]);
  const [bulletinStyleKey, setBulletinStyleKey] = useScopedSetting(BULLETIN_STORAGE_KEY, DEFAULT_BULLETIN, k => !!BULLETIN_STYLES[k]);
  // Board Content: five independent on/off toggles, one storage key per
  // component (see BOARD_COMPONENTS in boardConfig.js).
  const isOnOff = k => k === "true" || k === "false";
  const [learningGoalsOn, setLearningGoalsOn] = useScopedSetting(BOARD_COMPONENTS.learningGoals.storageKey, BOARD_COMPONENTS.learningGoals.default, isOnOff);
  const [essentialQuestionOn, setEssentialQuestionOn] = useScopedSetting(BOARD_COMPONENTS.essentialQuestion.storageKey, BOARD_COMPONENTS.essentialQuestion.default, isOnOff);
  const [agendaOn, setAgendaOn] = useScopedSetting(BOARD_COMPONENTS.agenda.storageKey, BOARD_COMPONENTS.agenda.default, isOnOff);
  const [bellRingerOn, setBellRingerOn] = useScopedSetting(BOARD_COMPONENTS.bellRinger.storageKey, BOARD_COMPONENTS.bellRinger.default, isOnOff);
  const [homeLearningOn, setHomeLearningOn] = useScopedSetting(BOARD_COMPONENTS.homeLearning.storageKey, BOARD_COMPONENTS.homeLearning.default, isOnOff);
  const toggleComponent = (value, setValue) => setValue(value === "true" ? "false" : "true");
  // Which order the five components above render in on the board — see
  // useBoardContentOrder/BOARD_CONTENT_ORDER_STORAGE_KEY in boardConfig.js.
  // Kept independent of the on/off state above so toggling something off
  // and back on doesn't lose its place in line.
  const [boardContentOrder, setBoardContentOrder] = useBoardContentOrder();
  const [dragKey, setDragKey] = useState(null);
  const [dropTargetKey, setDropTargetKey] = useState(null);
  // Lookup table so the Board Content rows below can render themselves by
  // iterating boardContentOrder instead of five near-identical hardcoded
  // <ToggleRow> lines — checked state and its setter for whichever
  // component key is being rendered.
  const boardContentState = {
    learningGoals: [learningGoalsOn, setLearningGoalsOn],
    essentialQuestion: [essentialQuestionOn, setEssentialQuestionOn],
    agenda: [agendaOn, setAgendaOn],
    bellRinger: [bellRingerOn, setBellRingerOn],
    homeLearning: [homeLearningOn, setHomeLearningOn],
  };
  const [wallTypeKey, setWallTypeKey] = useScopedSetting(WALL_TYPE_STORAGE_KEY, DEFAULT_WALL_TYPE, k => !!WALL_TYPES[k]);
  const [wallColorKey, setWallColorKey] = useScopedSetting(WALL_COLOR_STORAGE_KEY, DEFAULT_WALL_COLOR_BY_TYPE[DEFAULT_WALL_TYPE], null);
  const [boardSurfaceKey, setBoardSurfaceKey] = useScopedSetting(BOARD_SURFACE_STORAGE_KEY, DEFAULT_BOARD_SURFACE, k => !!BOARD_SURFACES[k]);
  const [slidingBoardsEnabled, setSlidingBoardsEnabled] = useScopedSetting(SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED, k => k === "true" || k === "false");
  const [slidingBoardsCount, setSlidingBoardsCount] = useScopedSetting(SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, k => /^[2-9]$/.test(k));

  const slidingOn = slidingBoardsEnabled === "true";

  const selectWallType = (typeId) => {
    setWallTypeKey(typeId);
    setWallColorKey(DEFAULT_WALL_COLOR_BY_TYPE[typeId]);
  };

  return (
    <div style={{ background: "#191919", borderRadius: 10, overflow: "hidden" }}>
      {BOARD_SETTINGS_CATEGORIES.map(cat => (
        <div key={cat.id}>
          <div
            onClick={() => onSelect(prev => prev === cat.id ? null : cat.id)}
            style={{
              padding: "14px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: selected === cat.id ? "#242424" : "transparent",
              borderLeft: selected === cat.id ? "3px solid var(--board-secondary)" : "3px solid transparent",
            }}
            onMouseEnter={e => { if (selected !== cat.id) e.currentTarget.style.background = "#1f1f1f"; }}
            onMouseLeave={e => { if (selected !== cat.id) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 15, fontWeight: 600, color: selected === cat.id ? "var(--board-secondary)" : "#fff", letterSpacing: 0.5 }}>
              {cat.label}
            </span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{selected === cat.id ? "▾" : "▸"}</span>
          </div>

          {selected === cat.id && (
            <div style={{ padding: "4px 8px 16px" }}>
              {cat.id === "background" && (
                <>
                  <SectionHeading>Wall Type</SectionHeading>
                  {Object.values(WALL_TYPES).map(t => (
                    <RadioRow key={t.id} selected={wallTypeKey === t.id} onClick={() => selectWallType(t.id)} label={t.label} />
                  ))}
                  <SectionHeading>Wall Color</SectionHeading>
                  {WALL_COLORS[WALL_TYPES[wallTypeKey] ? wallTypeKey : DEFAULT_WALL_TYPE].map(c => (
                    <RadioRow
                      key={c.id}
                      selected={wallColorSwatch(wallTypeKey, wallColorKey).id === c.id}
                      onClick={() => setWallColorKey(c.id)}
                      label={c.label}
                      swatch={<span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, background: c.base, border: `2px solid ${wallColorSwatch(wallTypeKey, wallColorKey).id === c.id ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}` }} />}
                    />
                  ))}
                </>
              )}

              {cat.id === "layout" && (
                <>
                  <SectionHeading>Board Layout</SectionHeading>
                  {Object.values(BOARD_ARRANGEMENTS).map(a => (
                    <RadioRow key={a.id} selected={arrangementKey === a.id} onClick={() => setArrangementKey(a.id)} label={a.label} />
                  ))}
                </>
              )}

              {cat.id === "bulletin" && (
                <>
                  <SectionHeading>Bulletin Board</SectionHeading>
                  {Object.values(BULLETIN_STYLES).map(b => (
                    <RadioRow
                      key={b.id}
                      selected={bulletinStyleKey === b.id}
                      onClick={() => setBulletinStyleKey(b.id)}
                      label={b.label}
                      swatch={<span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, background: b.background, backgroundImage: b.trim || undefined, backgroundSize: b.trim ? "10px 5px" : undefined, border: `2px solid ${bulletinStyleKey === b.id ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}` }} />}
                    />
                  ))}
                </>
              )}

              {cat.id === "content" && (
                <>
                  <SectionHeading>Board Content</SectionHeading>
                  {boardContentOrder.map((key) => {
                    const [value, setValue] = boardContentState[key];
                    return (
                      <ToggleRow
                        key={key}
                        checked={value === "true"}
                        onClick={() => toggleComponent(value, setValue)}
                        label={BOARD_COMPONENTS[key].label}
                        draggable
                        isDragging={dragKey === key}
                        isDropTarget={dropTargetKey === key && dragKey !== key}
                        onDragStart={e => { setDragKey(key); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={e => { e.preventDefault(); if (dragKey && dragKey !== key) setDropTargetKey(key); }}
                        onDrop={e => {
                          e.preventDefault();
                          if (dragKey && dragKey !== key) setBoardContentOrder(reorder(boardContentOrder, dragKey, key));
                          setDragKey(null);
                          setDropTargetKey(null);
                        }}
                        onDragEnd={() => { setDragKey(null); setDropTargetKey(null); }}
                      />
                    );
                  })}
                  <div style={{ fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", padding: "8px 14px 0", lineHeight: 1.5 }}>
                    Turn any combination on — each has its own space on the board. Drag the ☰ handle to reorder them; this order applies whether Sliding Boards (below) is on or off. Turning one off keeps whatever you've written there; it comes back if you turn it on again.
                  </div>
                </>
              )}

              {cat.id === "blackboard" && (
                <>
                  <SectionHeading>Board Surface</SectionHeading>
                  {Object.values(BOARD_SURFACES).map(s => (
                    <RadioRow key={s.id} selected={boardSurfaceKey === s.id} onClick={() => setBoardSurfaceKey(s.id)} label={s.label} />
                  ))}

                  <SectionHeading>Sliding Boards</SectionHeading>
                  <RadioRow selected={!slidingOn} onClick={() => setSlidingBoardsEnabled("false")} label="Off (single flat board)" />
                  <RadioRow selected={slidingOn} onClick={() => setSlidingBoardsEnabled("true")} label="On (multiple sliding panels)" />

                  {slidingOn && (
                    <>
                      <SectionHeading>Number of Boards</SectionHeading>
                      <div style={{ display: "flex", gap: 8, padding: "4px 14px 10px", flexWrap: "wrap" }}>
                        {SLIDING_BOARDS_COUNT_OPTIONS.map(n => (
                          <button
                            key={n}
                            onClick={() => setSlidingBoardsCount(n)}
                            style={{
                              width: 34, height: 34, borderRadius: "50%",
                              border: `2px solid ${slidingBoardsCount === n ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}`,
                              background: slidingBoardsCount === n ? "var(--board-secondary)" : "transparent",
                              color: slidingBoardsCount === n ? "var(--board-primary)" : "#ccc",
                              fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer",
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <div style={{ padding: "0 14px 4px", fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                        Applies to lessons that don't already define their own boards (Unit 10's Testing lessons keep their own board count). This is a maximum, not a fixed count — a lesson needs at least one learning goal per board, so one with fewer goals than the number picked here ends up with fewer boards too. Requires Learning Goals to be turned on in Board Content — with it off, there's nothing to split across boards, so it slides as a single board.
                      </div>
                      {panelCountInfo?.requestedCount != null && panelCountInfo.resolvedCount != null && panelCountInfo.resolvedCount < panelCountInfo.requestedCount && (
                        <div style={{ margin: "0 14px 8px", padding: "8px 10px", fontFamily: "Lato, sans-serif", fontSize: 11, lineHeight: 1.4, color: "var(--board-secondary)", background: "rgba(232,119,34,0.1)", border: "1px solid rgba(232,119,34,0.35)", borderRadius: 4 }}>
                          The lesson currently open above only has enough learning goals for {panelCountInfo.resolvedCount} board{panelCountInfo.resolvedCount === 1 ? "" : "s"} — it'll stay at {panelCountInfo.resolvedCount} even with {panelCountInfo.requestedCount} selected. Lessons with more goals will use more of them.
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ padding: "18px 20px", fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, borderTop: "1px solid #2a2a2a", marginTop: 8 }}>
        Changes save automatically and sync live to the board above.
      </div>
    </div>
  );
}
