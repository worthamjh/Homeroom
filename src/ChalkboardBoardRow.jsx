import { useState, useEffect } from "react";

/**
 * ChalkboardBoardRow
 *
 * Renders the chalkboard's slides + goals row. Modeled on an actual
 * multi-panel sliding chalkboard rail system (fixed boards mounted
 * behind, one board riding on rails/wheels in front that slides to
 * reveal what's behind it) rather than a text crossfade:
 *  - Each panel renders as a physical slab: a raised face with a lit top
 *    edge, a shadowed bottom edge, a visible side "spine" (the board's
 *    thickness), and a drop shadow it casts on the layer behind it.
 *  - A rail track (top and bottom bars with small wheel dots) spans the
 *    goals column and the handle sits on it, reinforcing that you're
 *    pulling a physical board along a track, not tapping a button.
 *  - Panels are stacked at the goals-column position (left: 60%). The
 *    current panel sits on top. Pulling the handle slides *only* the
 *    current panel to left: 0%, under the SmartBoard's footprint, where
 *    the SmartBoard's opaque background + higher z-index hides it. It
 *    stays parked there — the next panel underneath was never moved, so
 *    it's simply revealed once the top one clears it.
 *  - Because the panel behind is a real sibling sitting at that same
 *    spot the whole time, CSS's own stacking makes the reveal happen in
 *    real time as the top panel's edge sweeps across it — no separate
 *    reveal logic needed.
 *  - The column split is 60/40 to match the existing 3fr/2fr grid.
 *
 * Props:
 *   smartBoardSrc: string                          — same as existing `boardSlides`
 *   isOverview: boolean                             — same flag as App()
 *   overviewItems: string[]                         — activeUnit.overview, only used when isOverview
 *   onOverviewItemClick: (title: string) => void
 *   panels: Array<{ label?: string, goals: string[] }>   — from toGoalPanels(activeLesson), only used when !isOverview
 *   checkedGoals: object
 *   toggleGoal: (panelKey: string, idx: number) => void
 *   SmartBoard: React component                    — the existing SmartBoard component
 */
export function toGoalPanels(lesson) {
  if (lesson.goalPanels) return lesson.goalPanels;
  return [{ label: undefined, goals: lesson.goals }];
}

// A muted, slightly different green per stacked panel so parked boards
// One tone, reused by every panel — same #2d5a2d green as the main
// chalkboard itself, so a sliding panel doesn't visually announce
// itself as a "different" board mid-slide. Depth still comes through
// via the top/bottom/left bevel and drop shadow, just not a color
// shift.
const PANEL_TONE = (face) => ({ face, top: "#4d7a4d", bottom: "#163016", left: "#245024", spine: "#1a3319" });

// A plain metal track — real sliding-chalkboard rail systems are
// aluminum/steel, and that reads better against the wood frame than
// trying to force the rail into the board's own wood/chalk palette.
//
// Runs the full width of the board, not just the goals column, since a
// real rail spans the whole wall the boards hang on — the panels just
// happen to park under the SmartBoard's footprint when pulled all the
// way over. z-index sits below the SmartBoard's wrapper (1000) so the
// rail visually passes behind it rather than drawing on top of it.
// Pinned flush to top: 0 / bottom: 0 so it butts right up against the
// wood-brown border (the 4px top border above the chalkboard, and the
// chalk ledge below it) instead of floating a couple pixels inside the
// green board.
function Rail({ top }) {
  return (
    <div style={{ position: "absolute", left: 0, [top ? "top" : "bottom"]: 0, width: "100%", height: 4, boxSizing: "border-box", background: "#8a8a8a", borderTop: "1px solid #c7c7c7", borderBottom: "1px solid #4a4a4a", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "space-evenly", pointerEvents: "none" }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "#3a3a3a", flexShrink: 0 }} />
      ))}
    </div>
  );
}

// Default: matches the App-level "classic" preset (SmartBoard left, 60/40 split).
const DEFAULT_ARRANGEMENT = { order: ["slides", "goals"], gridTemplateColumns: "3fr 2fr" };

export default function ChalkboardBoardRow({
  smartBoardSrc,
  isOverview,
  overviewItems,
  onOverviewItemClick,
  panels,
  checkedGoals,
  toggleGoal,
  SmartBoard,
  arrangement = DEFAULT_ARRANGEMENT,
  surface = { face: "#2d5a2d", headerText: "rgba(255,255,255,0.65)", bodyText: "rgba(255,255,255,0.85)", bodyTextChecked: "rgba(255,255,255,0.3)", textShadow: "1px 1px 2px rgba(0,0,0,0.5)", checkboxBorder: "rgba(255,255,255,0.4)" },
  // Header text printed on each panel above the checklist — "Learning
  // Goals" when the checklist is the only thing on, "Objectives &
  // Benchmarks" when it's sharing the board with Full Agenda's other
  // fields.
  goalsLabel = "Learning Goals",
  // Color for that header. Defaults to the muted surface.headerText used
  // when Learning Goals is the only thing on the board (matching its
  // original look), but the caller passes surface.accent instead whenever
  // Objectives & Benchmarks is sharing the panel with Full Agenda's other
  // fields (Essential Question, Agenda, Bell Ringer, Home Learning) — all
  // of which use surface.accent via SectionHeader in FullAgendaBoard.jsx
  // — so every header in that shared section reads as one consistent set
  // instead of Objectives & Benchmarks standing out as a different color.
  goalsHeaderColor = surface.headerText,
  // Whether the Learning Goals checklist (header + items) renders at all
  // on each panel. Defaults true so every existing caller (Unit 10's
  // goalPanels lessons, any caller that doesn't pass this) is unaffected.
  // The Settings page's per-component toggles let a teacher turn Learning
  // Goals off while keeping Sliding Boards + the other Full Agenda fields
  // on, in which case each panel should show only extraContent.
  showGoals = true,
  // When true, Learning Goals is being authored by the teacher as a
  // freeform itemized field (see useEditableLearningGoals in
  // WebsterGrovesChemistry.jsx) rather than rendered from real
  // curriculum goals -- in that case it's handled entirely by the
  // caller's `extraContent` (same as the four Full Agenda fields),
  // not this component's own goals-checklist rendering below.
  learningGoalsEditable = false,
  // Which order the Learning Goals checklist and the four Full Agenda
  // fields render in on each panel face — the same
  // BOARD_CONTENT_ORDER_STORAGE_KEY/useBoardContentOrder value the flat
  // (non-sliding) board content column uses (see boardConfig.js), so
  // dragging a row in the settings panel reorders the sliding board's
  // content too instead of only ever affecting the flat layout. Defaults
  // to the same order as DEFAULT_BOARD_CONTENT_ORDER there.
  contentOrder = ["learningGoals", "essentialQuestion", "agenda", "bellRinger", "homeLearning"],
  // Extra content rendered on every panel face (including the fixed back
  // board), one item per non-"learningGoals" key in contentOrder — used
  // by the Full Agenda content template to carry Essential Question/
  // Agenda/Bell Ringer/Home Learning along on every board, since that
  // content isn't itself per-panel.
  //
  // Pass a FUNCTION `(key, isFront) => ReactNode`, not a plain element.
  // It's called once per panel per key, every render, so the content is
  // baked into each panel's own face and physically slides with it —
  // exactly like the goals checklist already does — instead of popping
  // in/out instantly the moment the front board changes, ahead of the CSS
  // transition that's still animating the old board out of the way.
  // `isFront` tells the caller's component which single instance (if
  // any) should actually be interactive: every instance reads from the
  // SAME state (the caller should own that state once, not per-panel —
  // per-panel-owned state would drift as a teacher slides between boards
  // and edits fields), so if more than one instance could enter an
  // editable state at once, they'd all flip into it together the moment
  // any one of them is clicked. See EditableField's `interactive` prop
  // for how the Full Agenda content template uses this.
  extraContent = null,
  // Rendered once per panel face, ahead of every item in contentOrder,
  // regardless of where a teacher has dragged things — same reasoning as
  // the flat column's Reset Board button (see WebsterGrovesChemistry.jsx):
  // it's a control, not board content, so it shouldn't move around as
  // part of the reorderable list. Pass a FUNCTION `(isFront) => ReactNode`
  // — same per-panel-baked, interactive-gating rationale as extraContent.
  renderReset = null,
}) {
  const [rawCurrent, setCurrent] = useState(0);

  // "Which board is slid into view" was previously just this raw state,
  // never reset or clamped when `panels` changes. That's fine while
  // staying on the same lesson (a board count NEVER decreases mid-lesson
  // in a way that matters here), but this component instance is reused
  // across lesson navigations that all go through the sliding branch —
  // React doesn't remount it just because the panels prop changed. So
  // leaving lesson A parked on board 3 of 3, then navigating to lesson B
  // with only 2 panels (a different Sliding Boards count, or simply fewer
  // goals to split), left `current` at 2 with only panels[0..1] to index:
  // every panel's `parked = i < current` came out true, so EVERY board
  // slid away and none rendered as the front, visible board — the exact
  // "changing the count affects other pages" symptom. Clamping to the
  // current panel set's actual bounds fixes that regardless of *why*
  // panels changed (different lesson, different Sliding Boards count,
  // whatever) — this is the one thing actually used for rendering below.
  const current = Math.min(rawCurrent, Math.max(panels.length - 1, 0));
  // Landing on a new lesson should start at its first board, not wherever
  // the previous lesson's board happened to be parked — panelKey (or
  // label, for curriculum-authored panels that don't set one) is stable
  // for a given lesson's panel set and changes when the lesson does.
  const panelSetId = panels[0]?.panelKey || panels[0]?.label || null;
  useEffect(() => {
    setCurrent(0);
  }, [panelSetId]);

  // Derive the same left/right split the static layout uses from the shared
  // arrangement config, so "Inverse" flips this sliding mechanic too instead
  // of only the plain layout. `order` says which side (slides vs goals)
  // comes first; `gridTemplateColumns` ("Xfr Yfr") gives their relative
  // widths in that same order.
  const smartboardOnRight = arrangement.order[0] === "goals";
  const [colA, colB] = arrangement.gridTemplateColumns.split(" ").map(s => parseFloat(s) || 1);
  const total = colA + colB;
  const firstPct = (colA / total) * 100;
  const secondPct = (colB / total) * 100;
  const smartboardWidthPct = smartboardOnRight ? secondPct : firstPct;
  const goalsWidthPct = smartboardOnRight ? firstPct : secondPct;
  const smartboardLeftPct = smartboardOnRight ? 100 - smartboardWidthPct : 0;
  const goalsHomeLeftPct = smartboardOnRight ? 0 : 100 - goalsWidthPct;
  // The "far edge" a pulled board travels to — the boundary of the SmartBoard
  // region furthest from the goals column's own home position, so a fully
  // parked board ends up entirely under the SmartBoard's footprint.
  const dockFarEdgePct = smartboardOnRight ? 100 - goalsWidthPct : 0;

  // One handle per movable board (every panel except the fixed back board).
  // Handle i is physically attached to board i — pulling it slides that
  // board (and anything still in front of it) out of the way, landing on
  // board i+1. A teacher can also jump straight to an earlier board by
  // clicking a docked handle — that pushes the boards in between back
  // into place instead of only ever advancing by one.
  const handleCount = Math.max(panels.length - 1, 0);
  // The first board docked goes all the way to the SmartBoard's far edge.
  // Every board docked after that stops just short of the one before it —
  // DOCK_STEP_PX further toward the goals column's home side (in pixels
  // rather than a percentage) — so its frame peeks out past the board in
  // front of it without exposing a wide strip of the writing surface. The
  // step has to be at least as wide as the corner handle's own footprint
  // (4px inset + 22px wide = 26px) or the handle would land half-buried
  // under the board in front of it — clickable, but only across part of
  // itself. 30px clears that with a little room to spare. Direction flips
  // with smartboardOnRight so boards always fan back toward "home" while
  // staying under the SmartBoard's coverage.
  const DOCK_STEP_PX = 30;
  const dockedLeftFor = (i) => `calc(${dockFarEdgePct}% + ${(smartboardOnRight ? -1 : 1) * i * DOCK_STEP_PX}px)`;
  // Trailing edge of a moving board — the side that's last to clear, and
  // therefore where the spine/reveal-seam belongs. Moving toward the right
  // (smartboardOnRight) trails on the left; moving left (classic) trails
  // on the right.
  const spineSide = smartboardOnRight ? "left" : "right";
  const dividerSide = smartboardOnRight ? "borderRight" : "borderLeft";
  // Chevrons read as "slide this direction" — which direction is actually
  // "pull away" vs "bring back" flips with the arrangement, same as
  // everything else here.
  const pullChevron = smartboardOnRight ? "›" : "‹";
  const returnChevron = smartboardOnRight ? "‹" : "›";

  return (
    <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
      {/* Slides column — stays put, high z-index so it visually occludes parked
          panels. This rectangle spans the full SmartBoard column, well past
          where any docked board actually sits, and SmartBoard doesn't fill it
          edge to edge (there's padding, plus SmartBoard vertically centers a
          shorter device mockup within its own 100%-height box). Without
          pointerEvents: "none" here, all of that empty space — invisible,
          but still real elements sitting on top in z-order — would silently
          swallow every click meant for a docked board's handle underneath,
          no matter how far it peeks out. "auto" is restored individually on
          SmartBoard's three actually-visible pieces (the frame, the SMART
          label bar, the marker tray) inside the component itself, so the
          board and its buttons stay clickable, but the genuinely empty
          margin around it doesn't. */}
      <div style={{ position: "absolute", left: `${smartboardLeftPct}%`, top: 0, width: `${smartboardWidthPct}%`, height: "100%", zIndex: 1000, boxSizing: "border-box", padding: 16, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <SmartBoard src={smartBoardSrc} />
      </div>

      {isOverview ? (
        // Overview mode: unchanged behavior, single static panel, no slide mechanic.
        <div style={{ position: "absolute", left: `${goalsHomeLeftPct}%`, top: 0, width: `${goalsWidthPct}%`, height: "100%", boxSizing: "border-box", [dividerSide]: "1px dashed rgba(255,255,255,0.18)", padding: 16, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)", letterSpacing: 2, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 8 }}>
            Unit Lessons
          </div>
          {overviewItems.map((item, i) => (
            <div key={i} onClick={() => onOverviewItemClick(item)}
              style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: "var(--board-secondary-accent)", minWidth: 18, opacity: 0.8 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontFamily: "Caveat, cursive", fontSize: 14, color: "rgba(255,255,255,0.82)", lineHeight: 1.3, textShadow: "1px 1px 2px rgba(0,0,0,0.5)" }}>{item}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          {panels.length > 1 && <Rail top />}
          {panels.length > 1 && <Rail />}

          {panels.map((panel, i) => {
            const parked = i < current;
            // panelKey is what checked-state is stored under — normally
            // just the display label, but a caller can pass an explicit
            // `panelKey` distinct from `label` (see buildSlidingPanels in
            // WebsterGrovesChemistry.jsx) so multiple auto-split panels can
            // share ONE checked-state namespace (matching the flat
            // checklist's keys) while still showing different labels.
            // IMPORTANT: this is deliberately the SAME value across every
            // auto-split panel of one lesson (buildSlidingPanels sets
            // panel.panelKey to the lesson's own title for every bucket),
            // which is exactly what checked-state needs — but it must NOT
            // also be reused as this div's React `key` below. Two sibling
            // panels sharing one key is an invalid/duplicate key, and React
            // silently mis-reconciles it: navigating between lessons with
            // different panel counts left a stale panel's DOM (and its own
            // "N of total" counter) still mounted alongside the new
            // lesson's panels, which is exactly the "1/2 on one side, 1/3
            // on the other, the left one won't click back" symptom. domKey
            // below folds in the panel's index so every sibling is unique
            // while panelKey itself stays untouched for checked-state.
            const panelKey = panel.panelKey || panel.label || `panel-${i}`;
            const domKey = `${panelKey}::${i}`;
            const tone = PANEL_TONE(surface.face);
            // The last panel represents the fixed board the whole rail system
            // is mounted in front of — not another movable slab. It never has
            // a slab behind it to slide over, so it renders flush with the
            // chalkboard itself (same green, same dashed seam the goals column
            // has always used) instead of getting its own spine/bevel/shadow.
            const isBackBoard = i === panels.length - 1;
            const isFront = i === current;
            return (
              <div
                key={domKey}
                style={{
                  position: "absolute",
                  left: parked ? dockedLeftFor(i) : `${goalsHomeLeftPct}%`,
                  top: 0,
                  width: `${goalsWidthPct}%`,
                  height: "100%",
                  boxSizing: "border-box",
                  transition: "left 750ms cubic-bezier(0.4, 0, 0.2, 1)",
                  // A single, constant stacking order for every board, parked
                  // or not: lower index always stays on top. While waiting
                  // its turn, that's what keeps the current board on top of
                  // the ones behind it. Once docked, that same rule means the
                  // first board ever pulled aside stays in front and every
                  // board docked after it slides in behind it — which, since
                  // z-index never actually changes for a given board, is also
                  // what makes the reveal-through sweep work without any
                  // extra timing logic: the outgoing board is guaranteed to
                  // already be above whatever's coming up behind it, for the
                  // entire slide, not just at the end.
                  zIndex: panels.length - i,
                }}
              >
                {!isBackBoard && (
                  // Spine — the board's visible edge/thickness. It also doubles
                  // as the visible "reveal line": since it's pinned to this
                  // panel's trailing edge, it's the seam you actually see
                  // sweeping across the board behind as this one slides away.
                  <div style={{ position: "absolute", [spineSide]: -7, top: 3, bottom: 3, width: 7, background: "#7a7a7a", border: "1px solid #4a4a4a", borderRadius: spineSide === "right" ? "0 2px 2px 0" : "2px 0 0 2px" }} />
                )}

                {!isBackBoard && (
                  // Handles — physically part of this board, not separately
                  // animated elements, so they ride along for the whole
                  // slide. One on each bottom corner of the frame: whichever
                  // side of this particular board ends up peeking out (left
                  // side for a board buried under later ones, right side for
                  // whichever board is fanned furthest right), there's a
                  // handle sitting right there and reachable.
                  <>
                    <button
                      // Docked boards slide back to their starting spot on
                      // click; boards still up front slide away as before.
                      onClick={() => setCurrent(parked ? i : i + 1)}
                      aria-label={parked ? `Slide board ${i + 1} back to its starting position` : `Slide board ${i + 1} to reveal the next layer`}
                      title={panel.label ? (parked ? `Bring "${panel.label}" back` : `Slide past "${panel.label}"`) : undefined}
                      style={{
                        position: "absolute",
                        left: 4,
                        bottom: 4,
                        width: 22, height: 14, borderRadius: 3,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        // Docked handles stay fully active (not dimmed) — they're
                        // just as clickable as the front one, since clicking them
                        // is how a board gets pulled back to its starting spot.
                        // Muted brown for "not your turn yet" keeps it out of the
                        // way visually; orange only lights up once a board is
                        // actually actionable (front or docked).
                        border: `2px solid ${isFront || parked ? "var(--board-secondary)" : "#a3703f"}`,
                        background: isFront || parked ? "#c9622b" : "#8a5a34",
                        boxShadow: "0 2px 5px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
                        cursor: "pointer", zIndex: 2100, padding: 0, opacity: 1,
                      }}
                    >
                      {/* Chevron reads as "slide this direction" rather than
                          a plain colored tab — points left ("pull me away")
                          when up front, right ("bring me back") once docked. */}
                      <span aria-hidden="true" style={{ fontSize: 10, lineHeight: 1, color: "rgba(0,0,0,0.55)", fontWeight: 700 }}>
                        {parked ? returnChevron : pullChevron}
                      </span>
                    </button>
                    <button
                      onClick={() => setCurrent(parked ? i : i + 1)}
                      aria-label={parked ? `Slide board ${i + 1} back to its starting position` : `Slide board ${i + 1} to reveal the next layer`}
                      title={panel.label ? (parked ? `Bring "${panel.label}" back` : `Slide past "${panel.label}"`) : undefined}
                      style={{
                        position: "absolute",
                        right: 4,
                        bottom: 4,
                        width: 22, height: 14, borderRadius: 3,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: `2px solid ${isFront || parked ? "var(--board-secondary)" : "#a3703f"}`,
                        background: isFront || parked ? "#c9622b" : "#8a5a34",
                        boxShadow: "0 2px 5px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
                        cursor: "pointer", zIndex: 2100, padding: 0, opacity: 1,
                      }}
                    >
                      <span aria-hidden="true" style={{ fontSize: 10, lineHeight: 1, color: "rgba(0,0,0,0.55)", fontWeight: 700 }}>
                        {parked ? returnChevron : pullChevron}
                      </span>
                    </button>

                    {/* This board's own position in the stack, sitting right
                        on the metal frame to the left of its slide button —
                        e.g. board 1 of 3, board 2 of 3 — rather than one
                        counter for the whole component that only ever
                        reflected the current board. */}
                    <div style={{ position: "absolute", right: 30, bottom: 5, fontFamily: "Lato, sans-serif", fontSize: 10, fontWeight: 700, color: "#333333", pointerEvents: "none", zIndex: 2100 }}>
                      {i + 1}/{panels.length}
                    </div>
                  </>
                )}

                {isBackBoard && (
                  // The fixed board gets the same "N of total" label as
                  // every movable one before it, just no handle — there's
                  // nothing further to slide it past. Styled for the flush
                  // green board rather than the metal frame, since it
                  // doesn't have one.
                  <div style={{ position: "absolute", right: 8, bottom: 6, fontFamily: "Lato, sans-serif", fontSize: 10, color: "rgba(255,255,255,0.35)", pointerEvents: "none", zIndex: 2100 }}>
                    {i + 1}/{panels.length}
                  </div>
                )}

                {/* Face */}
                <div
                  style={
                    isBackBoard
                      ? {
                          position: "absolute", inset: 0,
                          background: surface.face,
                          [dividerSide]: "1px dashed rgba(255,255,255,0.18)",
                          boxSizing: "border-box",
                          padding: 16,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          overflowY: "auto",
                        }
                      : {
                          position: "absolute", inset: 0,
                          background: `
                            radial-gradient(ellipse 70px 18px at 22% 25%, rgba(255,255,255,0.05), transparent 70%),
                            radial-gradient(ellipse 90px 16px at 68% 55%, rgba(255,255,255,0.04), transparent 70%),
                            radial-gradient(ellipse 60px 14px at 40% 85%, rgba(255,255,255,0.05), transparent 70%),
                            ${tone.face}
                          `,
                          // Aluminum frame all the way around the segment, like
                          // a real sliding-chalkboard panel — a light outer
                          // edge catching light, same idea real extruded-
                          // aluminum trim uses. Thick enough to give the
                          // corner handle somewhere real to sit. One flat
                          // light gray all the way through — no separate
                          // darker inner ring — so it reads as one solid
                          // metal frame rather than frame-plus-groove.
                          border: "11px solid #9a9a9a",
                          boxShadow: "6px 0 14px rgba(0,0,0,0.45), inset 0 0 0 12px #9a9a9a",
                          boxSizing: "border-box",
                          padding: 16,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                          overflowY: "auto",
                        }
                  }
                >
                  {/* Rendered on EVERY panel, ahead of anything in
                      contentOrder — a control, not reorderable board
                      content (see the `renderReset` prop comment above). */}
                  {renderReset && renderReset(isFront)}

                  {/* Printed on the panel itself now, not a floating overlay —
                      so it slides away with this board and the next panel's
                      own header comes with it when it's revealed. Rendered
                      in whichever position contentOrder puts "learningGoals"
                      (see the map below) — skipped entirely when Learning
                      Goals is toggled off. */}
                  {(() => {
                    // Tracked across the map below (not just each key's own
                    // array index) so a divider only ever appears above an
                    // item that actually renders — a toggled-off component
                    // earlier in contentOrder shouldn't leave a stray
                    // top-border floating above the first visible item.
                    let renderedCount = 0;
                    return contentOrder.map((key) => {
                    const dividerStyle = renderedCount > 0 ? { marginTop: 4, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.12)" } : undefined;

                    if (key === "learningGoals" && !learningGoalsEditable) {
                      // A board can legitimately have zero goals now that
                      // the board count is fixed rather than goal-driven
                      // (see buildSlidingPanels in boardConfig.js) — skip
                      // the header entirely rather than showing "Learning
                      // Goals" over an empty list, so a blank board reads
                      // as blank, not broken. When learningGoalsEditable is
                      // true this branch is skipped entirely and the key
                      // falls through to extraContent below instead.
                      if (!showGoals || panel.goals.length === 0) return null;
                      renderedCount++;
                      return (
                        <div key={key} style={dividerStyle}>
                          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: goalsHeaderColor, letterSpacing: 2, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 8, marginBottom: 2 }}>
                            {goalsLabel}
                          </div>
                          {panel.goals.map((goalItem, gi) => {
                            // A goal entry is either a plain string (Unit
                            // 10's curriculum-authored goalPanels,
                            // unchanged) or a { text, idx } object — used
                            // when panels are auto-split from a flat goals
                            // list (see buildSlidingPanels in
                            // WebsterGrovesChemistry.jsx) so the
                            // checked-state key matches the *original*
                            // goal's index, keeping it in sync with the
                            // flat checklist / Full Agenda views instead of
                            // colliding across panels.
                            const isIndexed = goalItem && typeof goalItem === "object";
                            const text = isIndexed ? goalItem.text : goalItem;
                            const idx = isIndexed ? goalItem.idx : gi;
                            const goalKey = `${panelKey}-${idx}`;
                            const checked = checkedGoals[goalKey];
                            return (
                              <div key={idx} onClick={() => toggleGoal(panelKey, idx)}
                                style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                                <div style={{ width: 15, height: 15, border: `2px solid ${checked ? "var(--board-secondary)" : surface.checkboxBorder}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, background: checked ? "var(--board-secondary)" : "transparent", transition: "all 0.15s" }}>
                                  {checked && <span style={{ color: "var(--board-secondary-fg)", fontSize: 9, lineHeight: 1 }}>✓</span>}
                                </div>
                                <span style={{ fontFamily: "Caveat, cursive", fontSize: 15, color: checked ? surface.bodyTextChecked : surface.bodyText, lineHeight: 1.35, textShadow: surface.textShadow, textDecoration: checked ? "line-through" : "none", minWidth: 0, wordBreak: "break-word" }}>
                                  {text}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    // Rendered on EVERY panel, same as the goals checklist
                    // — so it's baked into each board's own face and
                    // slides with it physically, instead of popping in/out
                    // the instant `current` changes, ahead of the CSS
                    // transition still animating the old board out of the
                    // way (that mismatch was the "text disappears off the
                    // first board and reappears on the next one, unlike
                    // Learning Goals" bug). `isFront` tells the caller's
                    // component whether THIS instance should be
                    // interactive — see the `extraContent` prop comment
                    // above for why only one instance may ever be.
                    if (!extraContent) return null;
                    const node = extraContent(key, isFront);
                    if (!node) return null;
                    renderedCount++;
                    return (
                      <div key={key} style={dividerStyle}>
                        {node}
                      </div>
                    );
                  });
                  })()}
                </div>
              </div>
            );
          })}

        </>
      )}
    </div>
  );
}
