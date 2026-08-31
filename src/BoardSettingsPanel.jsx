import { useState } from "react";

import {
  useScopedSetting,
  BOARD_ARRANGEMENTS, DEFAULT_ARRANGEMENT, ARRANGEMENT_STORAGE_KEY,
  bulletinStyles, isBulletinStyleId, migrateBulletinStyleId, DEFAULT_BULLETIN, BULLETIN_STORAGE_KEY,
  BOARD_COMPONENTS, useBoardContentOrder,
  WALL_TYPES, DEFAULT_WALL_TYPE, WALL_TYPE_STORAGE_KEY,
  WALL_COLORS, DEFAULT_WALL_COLOR_BY_TYPE, WALL_COLOR_STORAGE_KEY,
  wallColorSwatch, isCustomWallColor,
  BOARD_SURFACES, DEFAULT_BOARD_SURFACE, BOARD_SURFACE_STORAGE_KEY, surfaceColors,
  BOARD_ACCENT_PRESETS, DEFAULT_BOARD_ACCENT, BOARD_ACCENT_STORAGE_KEY,
  isBoardAccentKey, isCustomBoardAccent, boardAccentBaseColor,
  SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED,
  SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, SLIDING_BOARDS_COUNT_OPTIONS,
  DESIGN_AREAS, useOwnedDesignOptions,
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
 * `primaryColor`/`secondaryColor` are the teacher's profile colours,
 * passed down rather than fetched here: the bulletin swatches are built
 * from them (see bulletinStyles in boardConfig.js), and the trim ones
 * encode the colours inside an SVG data URI, which a CSS var cannot reach
 * -- so this needs the literal hex, not just var(--board-primary).
 * BuildPage already fetches the profile for its own theming, so it passes
 * what it has; omitted, they fall back to the app defaults.
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
      style={{ padding: "10px 14px", fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: selected ? "var(--board-secondary-accent)" : "#ccc", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderRadius: 5 }}
      onMouseEnter={e => { e.currentTarget.style.background = "#242424"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      {swatch ? swatch : (
        <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${selected ? "var(--board-secondary-accent)" : "rgba(255,255,255,0.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {selected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--board-secondary-accent)" }} />}
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
function ToggleRow({ checked, onClick, label, draggable, onDragStart, onDragOver, onDragEnd, isDragging }) {
  return (
    <div
      onDragOver={onDragOver}
      style={{
        padding: "6px 14px 6px 6px", display: "flex", alignItems: "center", gap: 6, borderRadius: 5,
        opacity: isDragging ? 0.4 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#242424"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
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
        onMouseEnter={e => { e.currentTarget.style.color = "var(--board-secondary-accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
      >
        ☰
      </div>
      <div
        onClick={onClick}
        style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: checked ? "var(--board-secondary-accent)" : "#ccc", cursor: "pointer", padding: "4px 0", minWidth: 0 }}
      >
        <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${checked ? "var(--board-secondary-accent)" : "rgba(255,255,255,0.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: checked ? "var(--board-secondary)" : "transparent" }}>
          {checked && <span style={{ color: "var(--board-secondary-fg)", fontSize: 10, lineHeight: 1, fontWeight: 900 }}>✓</span>}
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

export default function BoardSettingsPanel({ selected, onSelect, panelCountInfo, primaryColor, secondaryColor }) {
  // Every picker below is filtered through this, so gating a design is a
  // catalogue entry rather than a hunt through six render sites. See the
  // design catalogue in boardConfig.js.
  const design = useOwnedDesignOptions();
  // ...except whatever is currently SELECTED, which is always listed even
  // when it is not owned. The board keeps rendering a selection a teacher
  // no longer owns (deliberately -- see useOwnedDesignOptions), so hiding
  // it here would leave the panel showing no selected row at all for a
  // board that plainly has one. Better to show it, selected, and let them
  // keep or change it.
  const shows = (area, id, current) => design.isAvailable(area, id) || id === current;
  const [arrangementKey, setArrangementKey] = useScopedSetting(ARRANGEMENT_STORAGE_KEY, DEFAULT_ARRANGEMENT, k => !!BOARD_ARRANGEMENTS[k]);
  const [bulletinStyleKey, setBulletinStyleKey] = useScopedSetting(BULLETIN_STORAGE_KEY, DEFAULT_BULLETIN, isBulletinStyleId, migrateBulletinStyleId);
  const bulletinOptions = bulletinStyles(primaryColor, secondaryColor);
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
  const [boardAccentKey, setBoardAccentKey] = useScopedSetting(BOARD_ACCENT_STORAGE_KEY, DEFAULT_BOARD_ACCENT, isBoardAccentKey);
  // Swatches show the colour AFTER the contrast pass, sitting on the board
  // face it will actually sit on -- so the row shows what the teacher will
  // get rather than what they asked for, and a pick that had to be
  // corrected shows itself as corrected instead of lying.
  const accentPreview = (key) => {
    const base = boardAccentBaseColor(key, primaryColor, secondaryColor);
    return surfaceColors(boardSurfaceKey, base).accent;
  };
  const boardFace = surfaceColors(boardSurfaceKey).face;
  const [slidingBoardsEnabled, setSlidingBoardsEnabled] = useScopedSetting(SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED, k => k === "true" || k === "false");
  const [slidingBoardsCount, setSlidingBoardsCount] = useScopedSetting(SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, k => /^[2-5]$/.test(k));

  const slidingOn = slidingBoardsEnabled === "true";
  // Number of Boards is a single 1-5 control now, not a separate
  // on/off toggle plus a 2-5 count -- 1 board IS "off" (see
  // SLIDING_BOARDS_COUNT_OPTIONS in boardConfig.js). Internally this
  // still writes to the same two scoped settings for backward
  // compatibility with anything already stored.
  const displayedBoardCount = slidingOn ? slidingBoardsCount : "1";
  const setBoardCount = (n) => {
    if (n === "1") {
      setSlidingBoardsEnabled("false");
    } else {
      setSlidingBoardsCount(n);
      setSlidingBoardsEnabled("true");
    }
  };

  const selectWallType = (typeId) => {
    setWallTypeKey(typeId);
    setWallColorKey(DEFAULT_WALL_COLOR_BY_TYPE[typeId]);
  };

  return (
    <div data-tour="tour-sidebar" style={{ background: "#191919", borderRadius: 10, overflow: "hidden" }}>
      {BOARD_SETTINGS_CATEGORIES.map(cat => (
        <div key={cat.id}>
          <div
            data-tour={`tour-cat-${cat.id}`}
            onClick={() => onSelect(prev => prev === cat.id ? null : cat.id)}
            style={{
              padding: "14px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: selected === cat.id ? "#242424" : "transparent",
              borderLeft: selected === cat.id ? "3px solid var(--board-secondary)" : "3px solid transparent",
            }}
            onMouseEnter={e => { if (selected !== cat.id) e.currentTarget.style.background = "#1f1f1f"; }}
            onMouseLeave={e => { if (selected !== cat.id) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 15, fontWeight: 600, color: selected === cat.id ? "var(--board-secondary-accent)" : "#fff", letterSpacing: 0.5 }}>
              {cat.label}
            </span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{selected === cat.id ? "▾" : "▸"}</span>
          </div>

          {selected === cat.id && (
            <div style={{ padding: "4px 8px 16px" }}>
              {cat.id === "background" && (
                <>
                  <SectionHeading>Wall Type</SectionHeading>
                  {Object.values(WALL_TYPES).filter(t => shows(DESIGN_AREAS.WALL_TYPE, t.id, wallTypeKey)).map(t => (
                    <RadioRow key={t.id} selected={wallTypeKey === t.id} onClick={() => selectWallType(t.id)} label={t.label} />
                  ))}
                  {/* One palette for both wall types -- see WALL_COLORS. */}
                  <SectionHeading>Wall Color</SectionHeading>
                  {WALL_COLORS.filter(c => shows(DESIGN_AREAS.WALL_COLOR, c.id, wallColorSwatch(wallTypeKey, wallColorKey).id)).map(c => (
                    <RadioRow
                      key={c.id}
                      selected={wallColorSwatch(wallTypeKey, wallColorKey).id === c.id}
                      onClick={() => setWallColorKey(c.id)}
                      label={c.label}
                      swatch={<span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, background: c.base, border: `2px solid ${wallColorSwatch(wallTypeKey, wallColorKey).id === c.id ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}` }} />}
                    />
                  ))}
                  {/* Anything the six presets don't cover. Stored as the hex
                      itself rather than a preset id, which is how
                      wallColorSwatch tells the two apart. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px 2px" }}>
                    <input
                      type="color"
                      value={wallColorSwatch(wallTypeKey, wallColorKey).base}
                      onChange={e => setWallColorKey(e.target.value)}
                      title="Pick any wall color"
                      style={{ width: 26, height: 26, padding: 0, border: `2px solid ${isCustomWallColor(wallColorKey) ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}`, borderRadius: 4, background: "transparent", cursor: "pointer", flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: "Lato, sans-serif", fontSize: 12, color: isCustomWallColor(wallColorKey) ? "#fff" : "rgba(255,255,255,0.55)" }}>
                      {isCustomWallColor(wallColorKey) ? `Custom ${wallColorKey.toUpperCase()}` : "Custom color…"}
                    </span>
                  </div>
                </>
              )}

              {cat.id === "layout" && (
                <>
                  <SectionHeading>Board Layout</SectionHeading>
                  {Object.values(BOARD_ARRANGEMENTS).filter(a => shows(DESIGN_AREAS.BOARD_LAYOUT, a.id, arrangementKey)).map(a => (
                    <RadioRow key={a.id} selected={arrangementKey === a.id} onClick={() => setArrangementKey(a.id)} label={a.label} />
                  ))}
                </>
              )}

              {cat.id === "bulletin" && (
                <>
                  <SectionHeading>Bulletin Board</SectionHeading>
                  {Object.values(bulletinOptions).filter(b => shows(DESIGN_AREAS.BULLETIN, b.id, bulletinStyleKey)).map(b => (
                    <RadioRow
                      key={b.id}
                      selected={bulletinStyleKey === b.id}
                      onClick={() => setBulletinStyleKey(b.id)}
                      label={b.label}
                      /* A scallop swatch shows its top edge tile, scaled down
                         so a couple of bumps land inside 16px -- the dot
                         swatches already work this way. */
                      swatch={<span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, background: b.background, backgroundImage: b.scallop?.top || b.trim || undefined, backgroundSize: b.scallop ? "10px 5px" : b.trim ? "10px 5px" : undefined, backgroundRepeat: "repeat", border: `2px solid ${bulletinStyleKey === b.id ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}` }} />}
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
                        onDragStart={e => { setDragKey(key); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={e => { e.preventDefault(); if (dragKey && dragKey !== key) setBoardContentOrder(reorder(boardContentOrder, dragKey, key)); }}
                        onDragEnd={() => { setDragKey(null); }}
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
                  {Object.values(BOARD_SURFACES).filter(s => shows(DESIGN_AREAS.BOARD_SURFACE, s.id, boardSurfaceKey)).map(s => (
                    <RadioRow key={s.id} selected={boardSurfaceKey === s.id} onClick={() => setBoardSurfaceKey(s.id)} label={s.label} />
                  ))}

                  {/* Headers, checked checkboxes, goal numbers -- the accent
                      role on the board face. Every option here, preset or
                      custom, is run through the same contrast pass against
                      the surface selected above, so none of them can come
                      out unreadable. Swatches are drawn ON that surface for
                      the same reason. */}
                  <SectionHeading>Header &amp; Accent Color</SectionHeading>
                  {BOARD_ACCENT_PRESETS.filter(a => shows(DESIGN_AREAS.BOARD_ACCENT, a.id, boardAccentKey)).map(a => (
                    <RadioRow
                      key={a.id}
                      selected={boardAccentKey === a.id}
                      onClick={() => setBoardAccentKey(a.id)}
                      label={a.label}
                      swatch={
                        <span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, background: boardFace, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${boardAccentKey === a.id ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}` }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: accentPreview(a.id) }} />
                        </span>
                      }
                    />
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px 2px" }}>
                    <input
                      type="color"
                      value={boardAccentBaseColor(boardAccentKey, primaryColor, secondaryColor)}
                      onChange={e => setBoardAccentKey(e.target.value)}
                      title="Pick any header color"
                      style={{ width: 26, height: 26, padding: 0, border: `2px solid ${isCustomBoardAccent(boardAccentKey) ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}`, borderRadius: 4, background: "transparent", cursor: "pointer", flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: "Lato, sans-serif", fontSize: 12, color: isCustomBoardAccent(boardAccentKey) ? "#fff" : "rgba(255,255,255,0.55)" }}>
                      {isCustomBoardAccent(boardAccentKey) ? `Custom ${boardAccentKey.toUpperCase()}` : "Custom color…"}
                    </span>
                  </div>
                  <div style={{ padding: "2px 14px 4px", fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                    Used for section headers, checked boxes and goal numbers. Any color you pick is lightened or darkened just enough to stay readable on the board surface above — so it may not render as the exact shade you chose.
                  </div>

                  <SectionHeading>Number of Boards</SectionHeading>
                  <div style={{ display: "flex", gap: 8, padding: "4px 14px 10px", flexWrap: "wrap" }}>
                    {SLIDING_BOARDS_COUNT_OPTIONS.map(n => (
                      <button
                        key={n}
                        onClick={() => setBoardCount(n)}
                        title={n === "1" ? "1 board (a single flat board, no sliding)" : `${n} sliding boards`}
                        style={{
                          width: 34, height: 34, borderRadius: "50%",
                          border: `2px solid ${displayedBoardCount === n ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}`,
                          background: displayedBoardCount === n ? "var(--board-secondary)" : "transparent",
                          color: displayedBoardCount === n ? "var(--board-secondary-fg)" : "#ccc",
                          fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer",
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div style={{ padding: "0 14px 4px", fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                    1 board is a single flat board — no sliding. 2-5 boards slide, one at a time, on the classic rail-and-handle mechanic. Applies to lessons that don't already define their own boards (Unit 10's Testing lessons keep their own board count). This is a fixed count — you'll always get exactly this many boards, even if a lesson has fewer learning goals than that (the extra boards are simply blank, or carry only whatever else is turned on in Board Content) or Learning Goals is toggled off entirely.
                  </div>
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
