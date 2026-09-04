import { useState } from "react";
import BulletinPreview from "./BulletinPreview";
import { NOTEBOOK_TEMPLATES } from "./lib/notebooks";

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
  isBoardAccentKey, isCustomBoardAccent, boardAccentBaseColor, boardAccentPresetLabel,
  SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED,
  SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, SLIDING_BOARDS_COUNT_OPTIONS,
  DESIGN_AREAS, useOwnedDesignOptions,
  LEDGE_NOTEBOOK_KEY, DEFAULT_LEDGE_NOTEBOOK, isLedgeNotebookValue, parseLedgeNotebooks, serializeLedgeNotebooks,
  useLessonBoardCount,
  BELL_RINGER_PLACEMENT_KEY, DEFAULT_BELL_RINGER_PLACEMENT, isBellRingerPlacement,
  EXIT_SLIP_PLACEMENT_KEY, DEFAULT_EXIT_SLIP_PLACEMENT,
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
          // A row that cannot be dragged (a notebook not on the strip)
          // keeps the handle's space so the labels line up, but not the
          // handle.
          visibility: draggable === false ? "hidden" : "visible",
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

/**
 * A section label, optionally with a "?" that reveals an explanation.
 *
 * These explanations used to sit permanently under the controls, and
 * several of them ran to a dense paragraph -- so the panel read as a wall
 * of small grey text and the actual controls got lost in it. Jay: "I don't
 * mind having a written out explanation of things but maybe there is a way
 * where we can have a help button or ? button that then opens the box."
 *
 * Collapsed by default: a teacher who knows what a setting does never has
 * to read past it, and the detail is one click away when they don't.
 */
function SectionHeading({ children, help }) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 1.5, textTransform: "uppercase", padding: "12px 14px 4px", display: "flex", alignItems: "center", gap: 7 }}>
        <span>{children}</span>
        {help && (
          <button
            type="button"
            onClick={() => setHelpOpen(o => !o)}
            aria-expanded={helpOpen}
            aria-label={helpOpen ? "Hide explanation" : "What does this do?"}
            title={helpOpen ? "Hide explanation" : "What does this do?"}
            style={{
              width: 15, height: 15, flexShrink: 0, borderRadius: "50%", cursor: "pointer",
              border: `1px solid ${helpOpen ? "var(--board-secondary, #e87722)" : "rgba(255,255,255,0.3)"}`,
              background: helpOpen ? "var(--board-secondary, #e87722)" : "transparent",
              color: helpOpen ? "var(--board-secondary-fg, #1c1c1c)" : "rgba(255,255,255,0.5)",
              fontFamily: "Lato, sans-serif", fontSize: 10, fontWeight: 700, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              transition: "background 0.15s, color 0.15s, border-color 0.15s",
            }}
          >?</button>
        )}
      </div>
      {help && helpOpen && (
        <div style={{ padding: "0 14px 8px", fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
          {help}
        </div>
      )}
    </>
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

export default function BoardSettingsPanel({ selected, onSelect, panelCountInfo, primaryColor, secondaryColor, currentLesson }) {
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
  // Any number of notebooks can be out at once; the setting is a list
  // (see parseLedgeNotebooks). A ticked notebook the teacher no longer
  // owns stays listed, ticked, for the same reason `shows` above exists.
  const [ledgeNotebookValue, setLedgeNotebookValue] = useScopedSetting(LEDGE_NOTEBOOK_KEY, DEFAULT_LEDGE_NOTEBOOK, isLedgeNotebookValue);
  const ledgeNotebookIds = parseLedgeNotebooks(ledgeNotebookValue);
  const toggleLedgeNotebook = id => setLedgeNotebookValue(serializeLedgeNotebooks(
    ledgeNotebookIds.includes(id) ? ledgeNotebookIds.filter(x => x !== id) : [...ledgeNotebookIds, id]
  ));
  // The list's order is the order on the strip, so the ticked ones come
  // first in that order, then the rest of what the teacher owns.
  const notebookRows = [
    ...ledgeNotebookIds.map(id => NOTEBOOK_TEMPLATES.find(t => t.id === id)).filter(Boolean),
    ...NOTEBOOK_TEMPLATES.filter(t => !ledgeNotebookIds.includes(t.id) && design.isAvailable(DESIGN_AREAS.NOTEBOOK, t.id)),
  ];
  const [dragNotebookId, setDragNotebookId] = useState(null);
  // Board Content: five independent on/off toggles, one storage key per
  // component (see BOARD_COMPONENTS in boardConfig.js).
  const isOnOff = k => k === "true" || k === "false";
  const [learningGoalsOn, setLearningGoalsOn] = useScopedSetting(BOARD_COMPONENTS.learningGoals.storageKey, BOARD_COMPONENTS.learningGoals.default, isOnOff);
  const [essentialQuestionOn, setEssentialQuestionOn] = useScopedSetting(BOARD_COMPONENTS.essentialQuestion.storageKey, BOARD_COMPONENTS.essentialQuestion.default, isOnOff);
  const [agendaOn, setAgendaOn] = useScopedSetting(BOARD_COMPONENTS.agenda.storageKey, BOARD_COMPONENTS.agenda.default, isOnOff);
  const [bellRingerOn, setBellRingerOn] = useScopedSetting(BOARD_COMPONENTS.bellRinger.storageKey, BOARD_COMPONENTS.bellRinger.default, isOnOff);
  const [bellRingerPlacement, setBellRingerPlacement] = useScopedSetting(BELL_RINGER_PLACEMENT_KEY, DEFAULT_BELL_RINGER_PLACEMENT, isBellRingerPlacement);
  const [exitSlipOn, setExitSlipOn] = useScopedSetting(BOARD_COMPONENTS.exitSlip.storageKey, BOARD_COMPONENTS.exitSlip.default, isOnOff);
  const [exitSlipPlacement, setExitSlipPlacement] = useScopedSetting(EXIT_SLIP_PLACEMENT_KEY, DEFAULT_EXIT_SLIP_PLACEMENT, isBellRingerPlacement);
  // The two docs that can live in the Agenda instead of in their own block:
  // [current placement, setter, which end of the list "agenda" means].
  const placementFor = {
    bellRinger: [bellRingerPlacement, setBellRingerPlacement, "first"],
    exitSlip: [exitSlipPlacement, setExitSlipPlacement, "last"],
  };
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
    exitSlip: [exitSlipOn, setExitSlipOn],
  };
  const [wallTypeKey, setWallTypeKey] = useScopedSetting(WALL_TYPE_STORAGE_KEY, DEFAULT_WALL_TYPE, k => !!WALL_TYPES[k]);
  const [wallColorKey, setWallColorKey] = useScopedSetting(WALL_COLOR_STORAGE_KEY, DEFAULT_WALL_COLOR_BY_TYPE[DEFAULT_WALL_TYPE], null);
  const [boardSurfaceKey, setBoardSurfaceKey] = useScopedSetting(BOARD_SURFACE_STORAGE_KEY, DEFAULT_BOARD_SURFACE, k => !!BOARD_SURFACES[k]);
  // The typed-hex box under Header & Accent Color: what is being typed,
  // committed on Enter or on clicking away, if it is a real colour.
  const [accentHexDraft, setAccentHexDraft] = useState("");
  const commitAccentHex = () => {
    const raw = accentHexDraft.trim();
    if (!raw) return;
    const hex = (raw.startsWith("#") ? raw : `#${raw}`).toLowerCase();
    const full = /^#[0-9a-f]{3}$/.test(hex) ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    if (isCustomBoardAccent(full)) setBoardAccentKey(full);
    setAccentHexDraft("");
  };
  const [boardAccentKey, setBoardAccentKey] = useScopedSetting(BOARD_ACCENT_STORAGE_KEY, DEFAULT_BOARD_ACCENT, isBoardAccentKey);
  // Swatches show the colour AFTER the contrast pass, so a pick that had
  // to be corrected shows itself as corrected rather than lying about what
  // will render. They used to be drawn as a dot ON the board face to make
  // that comparison visible, which just read as a chalkboard-coloured
  // border around every swatch (Jay: "make the header accent color box
  // just the accent color"). The note under the list already says the
  // colour gets adjusted, so the swatch does not have to say it too.
  const accentPreview = (key) => {
    const base = boardAccentBaseColor(key, primaryColor, secondaryColor, boardSurfaceKey);
    return surfaceColors(boardSurfaceKey, base).accent;
  };
  // Number of Boards edits THIS LESSON now, not the whole board (see
  // useLessonBoardCount). One 1-5 value does both jobs the old
  // enabled+count pair did: 1 board IS "off". `currentLesson` comes from
  // Build, which already knows what its embedded board has open.
  const [displayedBoardCount, setBoardCount] = useLessonBoardCount(
    currentLesson?.unitIdx, currentLesson?.lessonTitle);
  // No lesson open means no lesson to set a count FOR. Better to say so
  // than to show a control that silently edits nothing.
  const hasLessonOpen = currentLesson?.unitIdx != null && !!currentLesson?.lessonTitle;

  const selectWallType = (typeId) => {
    setWallTypeKey(typeId);
    setWallColorKey(DEFAULT_WALL_COLOR_BY_TYPE[typeId]);
  };

  return (
    <div data-tour="tour-sidebar" style={{ background: "#191919", borderRadius: 10, overflow: "hidden" }}>
      {BOARD_SETTINGS_CATEGORIES.map(cat => (
        // data-tour sits on this WRAPPER, not on the header row inside it,
        // so the tour's spotlight covers the category AND the options it
        // reveals. On the header alone the options stayed dimmed while the
        // bar above them was lit, which read as though they belonged to
        // something else (Jay: "the dropdown options in the board content
        // should be as bright as the board content tab itself").
        <div key={cat.id} data-tour={`tour-cat-${cat.id}`}>
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
                      /* A real miniature of the strip rather than a tiled
                         edge tile -- see BulletinPreview. A 5px band is
                         about the thinnest that still reads as scallops at
                         swatch size. */
                      swatch={
                        <span style={{ width: 18, height: 18, flexShrink: 0, display: "block", borderRadius: 3, border: `2px solid ${bulletinStyleKey === b.id ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}`, boxSizing: "border-box" }}>
                          <BulletinPreview style={b} band={5} radius={1} />
                        </span>
                      }
                    />
                  ))}

                  {/* Notebooks live in this menu because that is where Jay
                      asked for them ("select it from the bulletin board
                      menu") and because that is where it hangs: pinned at
                      the right end of the strip. */}
                  <SectionHeading help="Notebooks hang at the right end of the bulletin board; tick as many as you want out. Each unit gets its own copy of each the first time you open it, saved to a Notebooks folder in your Drive. Tap one on the board to write in it. Add notebooks in the Store.">Notebooks</SectionHeading>
                  {/* Ticked notebooks first, in the order they hang on the
                      strip (drag the ☰ handle to change it, as with Board
                      Content), then the rest of what the teacher owns. */}
                  {notebookRows.map(t => (
                    <ToggleRow
                      key={t.id}
                      checked={ledgeNotebookIds.includes(t.id)}
                      onClick={() => toggleLedgeNotebook(t.id)}
                      label={`${t.label} · ${t.pages} pages`}
                      draggable={ledgeNotebookIds.includes(t.id)}
                      isDragging={dragNotebookId === t.id}
                      onDragStart={e => { if (!ledgeNotebookIds.includes(t.id)) { e.preventDefault(); return; } setDragNotebookId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragOver={e => { e.preventDefault(); if (dragNotebookId && dragNotebookId !== t.id && ledgeNotebookIds.includes(t.id)) setLedgeNotebookValue(serializeLedgeNotebooks(reorder(ledgeNotebookIds, dragNotebookId, t.id))); }}
                      onDragEnd={() => { setDragNotebookId(null); }}
                    />
                  ))}
                  {!NOTEBOOK_TEMPLATES.some(t => design.isAvailable(DESIGN_AREAS.NOTEBOOK, t.id)) && (
                    <div style={{ padding: "2px 14px 10px", fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "Lato, sans-serif" }}>
                      Notebooks you add in the Store show up here.
                    </div>
                  )}
                </>
              )}

              {cat.id === "content" && (
                <>
                  <SectionHeading help="Turn any combination on — each gets its own space on the board. Drag the ☰ handle to reorder them; that order applies whether Sliding Boards is on or off. Turning one off keeps whatever you've written there, and it comes back if you turn it on again.">Board Content</SectionHeading>
                  {!hasLessonOpen && (
                    // These toggles are global, unlike Number of Boards
                    // below -- they DO take effect from here, they just
                    // cannot be seen from here, because a unit page shows
                    // its calendar and lesson list rather than the board
                    // content. Jay: "the learning goals and stuff do not
                    // appear on the board (they don't need to on the unit
                    // board) but it is a bit confusing for someone new."
                    // So this says where they went, and does NOT disable
                    // the rows the way the no-lesson case does above.
                    <div style={{ padding: "2px 14px 10px", fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                      These appear on lesson boards. The unit page above shows its calendar and
                      lesson list instead, so changes here won&rsquo;t show until you open a lesson.
                    </div>
                  )}
                  {boardContentOrder.map((key) => {
                    const [value, setValue] = boardContentState[key];
                    return (
                      <div key={key}>
                      <ToggleRow
                        checked={value === "true"}
                        onClick={() => toggleComponent(value, setValue)}
                        label={BOARD_COMPONENTS[key].label}
                        draggable
                        isDragging={dragKey === key}
                        onDragStart={e => { setDragKey(key); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={e => { e.preventDefault(); if (dragKey && dragKey !== key) setBoardContentOrder(reorder(boardContentOrder, dragKey, key)); }}
                        onDragEnd={() => { setDragKey(null); }}
                      />
                      {/* Where the Bell Ringer lives: its own block, or the
                          first line of the Agenda. Only a choice while the
                          Bell Ringer is on; "inside the agenda" needs the
                          Agenda on too, and falls back to its own block
                          until it is. */}
                      {placementFor[key] && value === "true" && (() => {
                        const [placement, setPlacement, end] = placementFor[key];
                        return (
                          <div style={{ padding: "0 14px 10px 40px", display: "flex", flexDirection: "column", gap: 4 }}>
                            {[["section", "Its own section"], ["agenda", `Inside the Agenda, as its ${end} line`]].map(([id, label]) => (
                              <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "Lato, sans-serif", fontSize: 12, color: placement === id ? "#fff" : "rgba(255,255,255,0.6)" }}>
                                <input type="radio" name={`${key}Placement`} checked={placement === id} onChange={() => setPlacement(id)} />
                                {label}
                              </label>
                            ))}
                            <div style={{ fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.45 }}>
                              Same doc and buttons either way. Inside the Agenda suits a school that wants it on the posted agenda.
                            </div>
                          </div>
                        );
                      })()}
                      </div>
                    );
                  })}

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
                  <SectionHeading help="Used for section headers and goal numbers. Any colour you pick is lightened or darkened just enough to stay readable on the board surface above — so it may not render as the exact shade you chose.">Header &amp; Accent Color</SectionHeading>
                  {BOARD_ACCENT_PRESETS.filter(a => shows(DESIGN_AREAS.BOARD_ACCENT, a.id, boardAccentKey)).map(a => (
                    <RadioRow
                      key={a.id}
                      selected={boardAccentKey === a.id}
                      onClick={() => setBoardAccentKey(a.id)}
                      label={boardAccentPresetLabel(a.id, boardSurfaceKey)}
                      swatch={
                        <span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, background: accentPreview(a.id), border: `2px solid ${boardAccentKey === a.id ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}` }} />
                      }
                    />
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px 2px" }}>
                    <input
                      type="color"
                      value={boardAccentBaseColor(boardAccentKey, primaryColor, secondaryColor, boardSurfaceKey)}
                      onChange={e => setBoardAccentKey(e.target.value)}
                      onBlur={e => { if (isCustomBoardAccent(e.target.value) && e.target.value !== boardAccentKey) setBoardAccentKey(e.target.value); }}
                      title="Pick any header color"
                      style={{ width: 26, height: 26, padding: 0, border: `2px solid ${isCustomBoardAccent(boardAccentKey) ? "var(--board-secondary)" : "rgba(255,255,255,0.3)"}`, borderRadius: 4, background: "transparent", cursor: "pointer", flexShrink: 0 }}
                    />
                    {/* A hex box of our own. Chrome's picker only commits a
                        typed code on Enter -- click away and it is dropped
                        (Jay: "when you make a custom color and click off
                        of it, the option does not save"). This one saves
                        on Enter AND on clicking away. */}
                    <input
                      type="text"
                      value={accentHexDraft}
                      onChange={e => setAccentHexDraft(e.target.value)}
                      onFocus={e => e.target.select()}
                      onBlur={commitAccentHex}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { setAccentHexDraft(""); e.currentTarget.blur(); } }}
                      placeholder={isCustomBoardAccent(boardAccentKey) ? boardAccentKey.toUpperCase() : "Custom, e.g. #E87722"}
                      spellCheck={false}
                      title="Type a hex colour and press Enter or click away"
                      style={{ width: 118, fontFamily: "Lato, sans-serif", fontSize: 12, padding: "5px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "#fff", outline: "none" }}
                    />
                  </div>

                  <SectionHeading help="Sets how many boards this lesson has — just this one; every lesson keeps its own count and new ones start at 1. Pick 1 for a single flat board, or 2–5 to slide between them in class the way a real sliding chalkboard does. You always get exactly the number you pick, so any board you don't fill simply stays blank.">Number of Boards{hasLessonOpen ? ` — ${currentLesson.lessonTitle}` : ""}</SectionHeading>
                  {!hasLessonOpen && (
                    <div style={{ padding: "2px 14px 10px", fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                      Open a lesson on the board above to set how many boards it uses. Each lesson keeps its own count.
                    </div>
                  )}
                  {/* data-tour: the tour's "board-count" step rings this row
                      (see GuidedTour.jsx). */}
                  {hasLessonOpen && <div data-tour="tour-board-count" style={{ display: "flex", gap: 8, padding: "4px 14px 10px", flexWrap: "wrap" }}>
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
                  </div>}
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
