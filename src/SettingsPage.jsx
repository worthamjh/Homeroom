import { useState, useRef, useEffect, useCallback } from "react";
import {
  useScopedSetting,
  BOARD_ARRANGEMENTS, DEFAULT_ARRANGEMENT, ARRANGEMENT_STORAGE_KEY,
  BULLETIN_STYLES, DEFAULT_BULLETIN, BULLETIN_STORAGE_KEY,
  BOARD_COMPONENTS,
  WALL_TYPES, DEFAULT_WALL_TYPE, WALL_TYPE_STORAGE_KEY,
  WALL_COLORS, DEFAULT_WALL_COLOR_BY_TYPE, WALL_COLOR_STORAGE_KEY,
  wallColorSwatch,
  BOARD_SURFACES, DEFAULT_BOARD_SURFACE, BOARD_SURFACE_STORAGE_KEY,
  SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED,
  SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, SLIDING_BOARDS_COUNT_OPTIONS,
} from "./boardConfig";

/**
 * SettingsPage — "Board Settings", opened in its own browser tab from the
 * gear icon on the board (see TopBar in WebsterGrovesChemistry.jsx).
 *
 * Left: LiveBoardPreview — not a hand-built mockup, but the real board
 * (WebsterGrovesChemistry's App component) embedded live via an iframe on
 * "/?preview=1", scaled down to fit. A mockup meant reimplementing the
 * board's rendering a second time, and the two would drift — the original
 * preview never actually ran ChalkboardBoardRow's sliding-panel logic, so
 * a change like "how many goals land on each board" couldn't show up
 * accurately no matter how carefully the mockup was redrawn. The iframe
 * doesn't have that problem: it's the same component tree, same code
 * path, so whatever's true on the real board is true in the preview.
 * Right: a category list (Background, Board Layout, Bulletin Board, Board
 * Content, Blackboard) — clicking one highlights the matching region of
 * the preview (via postMessage into the iframe — see LiveBoardPreview and
 * the message listener in WebsterGrovesChemistry.jsx's App()) and expands
 * that category's options.
 *
 * Every setting is a "cross-tab-synced setting" (useScopedSetting, see
 * boardConfig.js): persisted to the same scoped localStorage keys the
 * board reads, and picked up live by any open board tab — including the
 * preview iframe, itself just another copy of the same app — via the
 * browser's `storage` event. No backend, no page reload, just tabs
 * sharing localStorage.
 */

// Intrinsic size the preview iframe renders its document at — matches a
// typical board-tab browser window closely enough that layout (font
// sizes, how many unit tabs fit before wrapping, etc.) reads the same in
// miniature as it would full-size, rather than reflowing differently at
// some arbitrary narrow width the way a naively `width: 100%` iframe
// would. LiveBoardPreview scales this down with a CSS transform to fit
// whatever width is actually available, the same way a browser zoom
// level shrinks a whole page without changing how it lays out internally.
const PREVIEW_W = 1600;
const PREVIEW_H = 900;

function LiveBoardPreview({ highlightRegion, onPanelCountInfo }) {
  const wrapRef = useRef(null);
  const iframeRef = useRef(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setScale(el.clientWidth / PREVIEW_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sendHighlight = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "homeroom-settings-highlight", region: highlightRegion },
      window.location.origin
    );
  }, [highlightRegion]);

  // Re-send whenever the selected category changes...
  useEffect(() => { sendHighlight(); }, [sendHighlight]);

  // ...and once more as soon as the iframe says it's actually ready to
  // receive messages (it may finish loading — or reload, since navigating
  // "/?preview=1" fresh happens on first mount — after this effect above
  // already fired once with nothing listening yet).
  useEffect(() => {
    const handler = (e) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "homeroom-settings-preview-ready") sendHighlight();
      // The preview reports how many boards the CURRENT lesson actually
      // resolved to — which can be lower than the Sliding Boards Count
      // setting, since a lesson with fewer goals than the requested count
      // simply can't fill that many boards. Surfacing it lets the count
      // control below explain itself instead of looking broken when
      // bumping 3 → 5 does nothing for a 3-goal lesson.
      if (e.data?.type === "homeroom-preview-panel-count") {
        onPanelCountInfo?.({ requestedCount: e.data.requestedCount, resolvedCount: e.data.resolvedCount });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [sendHighlight, onPanelCountInfo]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%", maxWidth: 980,
        aspectRatio: `${PREVIEW_W} / ${PREVIEW_H}`,
        overflow: "hidden", borderRadius: 8,
        boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
        background: "#1a1a1a",
      }}
    >
      <iframe
        ref={iframeRef}
        src="/?preview=1"
        title="Live board preview"
        scrolling="no"
        style={{
          width: PREVIEW_W, height: PREVIEW_H,
          border: "none",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          // Purely a preview, not a second interactive copy of the board —
          // clicks shouldn't navigate lessons inside the tiny embedded
          // copy. The real board tab is what "← Back to the board" returns
          // to, unaffected by anything here.
          pointerEvents: "none",
          display: "block",
        }}
      />
    </div>
  );
}

const CATEGORIES = [
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
      style={{ padding: "10px 14px", fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: selected ? "#E87722" : "#ccc", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderRadius: 5 }}
      onMouseEnter={e => { e.currentTarget.style.background = "#242424"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      {swatch ? swatch : (
        <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${selected ? "#E87722" : "rgba(255,255,255,0.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {selected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#E87722" }} />}
        </span>
      )}
      {label}
    </div>
  );
}

// Board Content is a set of independent on/off switches (any combination
// can be on at once), unlike every other category here which is a
// single-choice preset — so it gets its own checkbox-style row instead of
// reusing RadioRow's single-selection radio-button look.
function ToggleRow({ checked, onClick, label }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: "10px 14px", fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: checked ? "#E87722" : "#ccc", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderRadius: 5 }}
      onMouseEnter={e => { e.currentTarget.style.background = "#242424"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${checked ? "#E87722" : "rgba(255,255,255,0.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: checked ? "#E87722" : "transparent" }}>
        {checked && <span style={{ color: "#1a1a1a", fontSize: 10, lineHeight: 1, fontWeight: 900 }}>✓</span>}
      </span>
      {label}
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

export default function SettingsPage() {
  const [selected, setSelected] = useState("background");
  // { requestedCount, resolvedCount } for whatever lesson the preview is
  // currently showing — reported by LiveBoardPreview from the embedded
  // board itself (see the "homeroom-preview-panel-count" message), not
  // computed here, since only the real board knows how many goals that
  // specific lesson actually has.
  const [panelCountInfo, setPanelCountInfo] = useState(null);

  const [arrangementKey, setArrangementKey] = useScopedSetting(ARRANGEMENT_STORAGE_KEY, DEFAULT_ARRANGEMENT, k => !!BOARD_ARRANGEMENTS[k]);
  const [bulletinStyleKey, setBulletinStyleKey] = useScopedSetting(BULLETIN_STORAGE_KEY, DEFAULT_BULLETIN, k => !!BULLETIN_STYLES[k]);
  // Board Content: five independent on/off toggles, one storage key per
  // component (see BOARD_COMPONENTS in boardConfig.js) — replaced the old
  // single "Board Content" preset choice.
  const isOnOff = k => k === "true" || k === "false";
  const [learningGoalsOn, setLearningGoalsOn] = useScopedSetting(BOARD_COMPONENTS.learningGoals.storageKey, BOARD_COMPONENTS.learningGoals.default, isOnOff);
  const [essentialQuestionOn, setEssentialQuestionOn] = useScopedSetting(BOARD_COMPONENTS.essentialQuestion.storageKey, BOARD_COMPONENTS.essentialQuestion.default, isOnOff);
  const [agendaOn, setAgendaOn] = useScopedSetting(BOARD_COMPONENTS.agenda.storageKey, BOARD_COMPONENTS.agenda.default, isOnOff);
  const [bellRingerOn, setBellRingerOn] = useScopedSetting(BOARD_COMPONENTS.bellRinger.storageKey, BOARD_COMPONENTS.bellRinger.default, isOnOff);
  const [homeLearningOn, setHomeLearningOn] = useScopedSetting(BOARD_COMPONENTS.homeLearning.storageKey, BOARD_COMPONENTS.homeLearning.default, isOnOff);
  const toggleComponent = (value, setValue) => setValue(value === "true" ? "false" : "true");
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
    <div style={{ minHeight: "100vh", background: "#141414", fontFamily: "Lato, sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#1a1a1a", borderBottom: "4px solid #E87722", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "Oswald, sans-serif", color: "#fff", fontSize: 22, fontWeight: 600, letterSpacing: 1 }}>
          Board <span style={{ color: "#E87722" }}>Settings</span>
        </div>
        <a
          href="/"
          onClick={e => {
            // Settings opens in its own tab specifically so the original
            // board tab (wherever the teacher had navigated to — a
            // specific lesson, a unit overview, etc.) stays untouched
            // behind it. Navigating this tab to "/" would just load a
            // fresh copy of the app at the homepage, losing that context.
            // Closing the tab instead reveals the real board tab as-is.
            // window.close() only succeeds on a tab opened via script
            // (which this one is, via the gear icon's window.open); if
            // it's a no-op (e.g. someone typed /settings in directly),
            // fall through to the normal "/" navigation.
            window.close();
            setTimeout(() => {
              if (!window.closed) window.location.href = "/";
            }, 50);
            e.preventDefault();
          }}
          style={{ fontFamily: "Lato, sans-serif", fontSize: 12, fontWeight: 700, color: "#E87722", textDecoration: "none" }}
        >
          ← Back to the board
        </a>
      </div>

      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 0 }}>
        {/* ── Live scaled preview ── */}
        <div style={{ flex: "3 1 700px", padding: "40px 40px", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 360 }}>
          <div style={{ width: "100%", maxWidth: 980 }}>
            <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.4)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 14, textAlign: "center" }}>
              Live Preview
            </div>
            <LiveBoardPreview highlightRegion={selected} onPanelCountInfo={setPanelCountInfo} />
            {selected && (
              <div style={{ marginTop: 14, textAlign: "center", fontFamily: "Lato, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {CATEGORIES.find(c => c.id === selected)?.blurb}
              </div>
            )}
          </div>
        </div>

        {/* ── Category list + options ── */}
        <div style={{ flex: "0 0 380px", minWidth: 320, background: "#191919", borderLeft: "1px solid #2a2a2a", padding: "20px 0" }}>
          {CATEGORIES.map(cat => (
            <div key={cat.id}>
              <div
                onClick={() => setSelected(prev => prev === cat.id ? null : cat.id)}
                style={{
                  padding: "14px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: selected === cat.id ? "#242424" : "transparent",
                  borderLeft: selected === cat.id ? "3px solid #E87722" : "3px solid transparent",
                }}
                onMouseEnter={e => { if (selected !== cat.id) e.currentTarget.style.background = "#1f1f1f"; }}
                onMouseLeave={e => { if (selected !== cat.id) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 15, fontWeight: 600, color: selected === cat.id ? "#E87722" : "#fff", letterSpacing: 0.5 }}>
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
                          swatch={<span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, background: c.base, border: `2px solid ${wallColorSwatch(wallTypeKey, wallColorKey).id === c.id ? "#E87722" : "rgba(255,255,255,0.3)"}` }} />}
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
                          swatch={<span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, background: b.background, backgroundImage: b.trim || undefined, backgroundSize: b.trim ? "10px 5px" : undefined, border: `2px solid ${bulletinStyleKey === b.id ? "#E87722" : "rgba(255,255,255,0.3)"}` }} />}
                        />
                      ))}
                    </>
                  )}

                  {cat.id === "content" && (
                    <>
                      <SectionHeading>Board Content</SectionHeading>
                      <ToggleRow checked={learningGoalsOn === "true"} onClick={() => toggleComponent(learningGoalsOn, setLearningGoalsOn)} label="Learning Goals" />
                      <ToggleRow checked={essentialQuestionOn === "true"} onClick={() => toggleComponent(essentialQuestionOn, setEssentialQuestionOn)} label="Essential Question" />
                      <ToggleRow checked={agendaOn === "true"} onClick={() => toggleComponent(agendaOn, setAgendaOn)} label="Agenda" />
                      <ToggleRow checked={bellRingerOn === "true"} onClick={() => toggleComponent(bellRingerOn, setBellRingerOn)} label="Bell Ringer" />
                      <ToggleRow checked={homeLearningOn === "true"} onClick={() => toggleComponent(homeLearningOn, setHomeLearningOn)} label="Home Learning" />
                      <div style={{ fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.4)", padding: "8px 14px 0", lineHeight: 1.5 }}>
                        Turn any combination on — each has its own space on the board. Turning one off keeps whatever you've written there; it comes back if you turn it on again.
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
                                  border: `2px solid ${slidingBoardsCount === n ? "#E87722" : "rgba(255,255,255,0.3)"}`,
                                  background: slidingBoardsCount === n ? "#E87722" : "transparent",
                                  color: slidingBoardsCount === n ? "#1a1a1a" : "#ccc",
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
                            <div style={{ margin: "0 14px 8px", padding: "8px 10px", fontFamily: "Lato, sans-serif", fontSize: 11, lineHeight: 1.4, color: "#E87722", background: "rgba(232,119,34,0.1)", border: "1px solid rgba(232,119,34,0.35)", borderRadius: 4 }}>
                              The lesson currently shown in the preview only has enough learning goals for {panelCountInfo.resolvedCount} board{panelCountInfo.resolvedCount === 1 ? "" : "s"} — it'll stay at {panelCountInfo.resolvedCount} even with {panelCountInfo.requestedCount} selected. Lessons with more goals will use more of them.
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

          <div style={{ padding: "18px 20px 0", fontFamily: "Lato, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, borderTop: "1px solid #2a2a2a", marginTop: 8 }}>
            Changes save automatically and sync live to any open board tab.
          </div>
        </div>
      </div>
    </div>
  );
}
