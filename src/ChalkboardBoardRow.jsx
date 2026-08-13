import { useState } from "react";

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
// read as distinct physical slabs rather than one repeating color.
const PANEL_TONES = [
  { face: "#2d5a2d", top: "#4d7a4d", bottom: "#163016", left: "#245024", spine: "#1a3319" },
  { face: "#295228", top: "#4a754a", bottom: "#142c14", left: "#204a20", spine: "#173015" },
  { face: "#254a24", top: "#476f47", bottom: "#122712", left: "#1c451c", spine: "#152a13" },
  { face: "#21421f", top: "#43693f", bottom: "#102310", left: "#183f18", spine: "#132810" },
];

// A plain metal track — real sliding-chalkboard rail systems are
// aluminum/steel, and that reads better against the wood frame than
// trying to force the rail into the board's own wood/chalk palette.
function Rail({ top }) {
  return (
    <div style={{ position: "absolute", left: "60%", [top ? "top" : "bottom"]: 2, width: "40%", height: 4, boxSizing: "border-box", background: "#8a8a8a", borderTop: "1px solid #c7c7c7", borderBottom: "1px solid #4a4a4a", zIndex: 1800, display: "flex", alignItems: "center", justifyContent: "space-evenly", pointerEvents: "none" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "#3a3a3a" }} />
      ))}
    </div>
  );
}

export default function ChalkboardBoardRow({
  smartBoardSrc,
  isOverview,
  overviewItems,
  onOverviewItemClick,
  panels,
  checkedGoals,
  toggleGoal,
  SmartBoard,
}) {
  const [current, setCurrent] = useState(0);

  const handleReveal = () => {
    setCurrent((c) => (c + 1) % panels.length);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
      {/* Slides column — stays put, high z-index so it visually occludes parked panels */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "60%", height: "100%", zIndex: 1000, boxSizing: "border-box", padding: 16, display: "flex", justifyContent: "center" }}>
        <SmartBoard src={smartBoardSrc} />
      </div>

      {isOverview ? (
        // Overview mode: unchanged behavior, single static panel, no slide mechanic.
        <div style={{ position: "absolute", left: "60%", top: 0, width: "40%", height: "100%", boxSizing: "border-box", borderLeft: "1px dashed rgba(255,255,255,0.18)", padding: 16, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)", letterSpacing: 2, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 8 }}>
            Unit Lessons
          </div>
          {overviewItems.map((item, i) => (
            <div key={i} onClick={() => onOverviewItemClick(item)}
              style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: "#E87722", minWidth: 18, opacity: 0.8 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontFamily: "Caveat, cursive", fontSize: 14, color: "rgba(255,255,255,0.82)", lineHeight: 1.3, textShadow: "1px 1px 2px rgba(0,0,0,0.5)" }}>{item}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          {panels.length > 1 && <Rail top />}
          {panels.length > 1 && <Rail />}

          {/* Handle — grabs the rail and pulls the current board along it */}
          {panels.length > 1 && (
            <button
              onClick={handleReveal}
              aria-label="Slide the board to reveal the next layer"
              style={{
                position: "absolute", right: 3, top: "50%", transform: "translateY(-50%)",
                width: 14, height: 52, borderRadius: 3, border: "2px solid #E87722",
                background: "#c9622b", boxShadow: "0 2px 5px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
                cursor: "pointer", zIndex: 2100, padding: 0,
              }}
            />
          )}

          {/* Label overlay, always shows the current panel's label */}
          <div style={{ position: "absolute", left: "60%", top: 9, width: "40%", boxSizing: "border-box", paddingLeft: 16, fontFamily: "Oswald, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.65)", letterSpacing: 2, textTransform: "uppercase", zIndex: 1900, pointerEvents: "none" }}>
            {panels[current].label || "Learning Goals"}
          </div>

          {panels.map((panel, i) => {
            const parked = i < current;
            const panelKey = panel.label || `panel-${i}`;
            const tone = PANEL_TONES[i % PANEL_TONES.length];
            return (
              <div
                key={panelKey}
                style={{
                  position: "absolute",
                  left: parked ? "0%" : "60%",
                  top: 0,
                  width: "40%",
                  height: "100%",
                  boxSizing: "border-box",
                  transition: "left 750ms cubic-bezier(0.4, 0, 0.2, 1)",
                  zIndex: panels.length - i,
                }}
              >
                {/* Spine — the board's visible edge/thickness. It also doubles as
                    the visible "reveal line": since it's pinned to this panel's
                    trailing edge, it's the seam you actually see sweeping across
                    the board behind as this one slides away. */}
                <div style={{ position: "absolute", right: -7, top: 3, bottom: 3, width: 7, background: tone.spine, border: "1px solid rgba(0,0,0,0.5)", borderRadius: "0 2px 2px 0" }} />

                {/* Face */}
                <div
                  style={{
                    position: "absolute", inset: 0,
                    background: `
                      radial-gradient(ellipse 70px 18px at 22% 25%, rgba(255,255,255,0.05), transparent 70%),
                      radial-gradient(ellipse 90px 16px at 68% 55%, rgba(255,255,255,0.04), transparent 70%),
                      radial-gradient(ellipse 60px 14px at 40% 85%, rgba(255,255,255,0.05), transparent 70%),
                      ${tone.face}
                    `,
                    borderTop: `2px solid ${tone.top}`,
                    borderBottom: `3px solid ${tone.bottom}`,
                    borderLeft: `2px solid ${tone.left}`,
                    boxShadow: "6px 0 14px rgba(0,0,0,0.45)",
                    boxSizing: "border-box",
                    padding: "34px 16px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    overflowY: "auto",
                  }}
                >
                  {panel.goals.map((goal, gi) => {
                    const key = `${panelKey}-${gi}`;
                    const checked = checkedGoals[key];
                    return (
                      <div key={gi} onClick={() => toggleGoal(panelKey, gi)}
                        style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                        <div style={{ width: 15, height: 15, border: `2px solid ${checked ? "#E87722" : "rgba(255,255,255,0.4)"}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, background: checked ? "#E87722" : "transparent", transition: "all 0.15s" }}>
                          {checked && <span style={{ color: "white", fontSize: 9, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontFamily: "Caveat, cursive", fontSize: 15, color: checked ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)", lineHeight: 1.35, textShadow: "1px 1px 2px rgba(0,0,0,0.5)", textDecoration: checked ? "line-through" : "none", minWidth: 0, wordBreak: "break-word" }}>
                          {goal}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {panels.length > 1 && (
            <div style={{ position: "absolute", right: 8, bottom: 4, fontFamily: "Lato, sans-serif", fontSize: 10, color: "rgba(255,255,255,0.35)", zIndex: 1900 }}>
              {current + 1} / {panels.length}
            </div>
          )}
        </>
      )}
    </div>
  );
}
