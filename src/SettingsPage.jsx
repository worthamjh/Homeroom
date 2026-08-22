import { useState } from "react";
import {
  useScopedSetting,
  BOARD_ARRANGEMENTS, DEFAULT_ARRANGEMENT, ARRANGEMENT_STORAGE_KEY,
  BULLETIN_STYLES, DEFAULT_BULLETIN, BULLETIN_STORAGE_KEY,
  BOARD_CONTENT_TEMPLATES, DEFAULT_CONTENT_TEMPLATE, CONTENT_TEMPLATE_STORAGE_KEY,
  WALL_TYPES, DEFAULT_WALL_TYPE, WALL_TYPE_STORAGE_KEY,
  WALL_COLORS, DEFAULT_WALL_COLOR_BY_TYPE, WALL_COLOR_STORAGE_KEY,
  wallBackgroundStyle, wallColorSwatch,
  BOARD_SURFACES, DEFAULT_BOARD_SURFACE, BOARD_SURFACE_STORAGE_KEY, surfaceColors,
  SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED,
  SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, SLIDING_BOARDS_COUNT_OPTIONS,
} from "./boardConfig";

/**
 * SettingsPage — "Board Settings", opened in its own browser tab from the
 * gear icon on the board (see TopBar in WebsterGrovesChemistry.jsx).
 *
 * Left: a live, scaled-down preview of the board reflecting every setting
 * below in real time. Right: a category list (Background, Board Layout,
 * Bulletin Board, Board Content, Blackboard) — clicking one highlights the
 * matching region of the preview and expands that category's options.
 *
 * Every setting is a "cross-tab-synced setting" (useScopedSetting, see
 * boardConfig.js): persisted to the same scoped localStorage keys the
 * board reads, and picked up live by any open board tab via the browser's
 * `storage` event — no backend, no page reload, just two tabs sharing
 * localStorage.
 */

const SAMPLE_GOALS = [
  "I will be able to identify key vocabulary for this unit.",
  "I will be able to explain the core concept in my own words.",
  "I will be able to apply today's skill to a new problem.",
];

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

function SectionHeading({ children }) {
  return (
    <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 1.5, textTransform: "uppercase", padding: "12px 14px 4px" }}>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [selected, setSelected] = useState("background");

  const [arrangementKey, setArrangementKey] = useScopedSetting(ARRANGEMENT_STORAGE_KEY, DEFAULT_ARRANGEMENT, k => !!BOARD_ARRANGEMENTS[k]);
  const [bulletinStyleKey, setBulletinStyleKey] = useScopedSetting(BULLETIN_STORAGE_KEY, DEFAULT_BULLETIN, k => !!BULLETIN_STYLES[k]);
  const [contentTemplateKey, setContentTemplateKey] = useScopedSetting(CONTENT_TEMPLATE_STORAGE_KEY, DEFAULT_CONTENT_TEMPLATE, k => !!BOARD_CONTENT_TEMPLATES[k]);
  const [wallTypeKey, setWallTypeKey] = useScopedSetting(WALL_TYPE_STORAGE_KEY, DEFAULT_WALL_TYPE, k => !!WALL_TYPES[k]);
  const [wallColorKey, setWallColorKey] = useScopedSetting(WALL_COLOR_STORAGE_KEY, DEFAULT_WALL_COLOR_BY_TYPE[DEFAULT_WALL_TYPE], null);
  const [boardSurfaceKey, setBoardSurfaceKey] = useScopedSetting(BOARD_SURFACE_STORAGE_KEY, DEFAULT_BOARD_SURFACE, k => !!BOARD_SURFACES[k]);
  const [slidingBoardsEnabled, setSlidingBoardsEnabled] = useScopedSetting(SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED, k => k === "true" || k === "false");
  const [slidingBoardsCount, setSlidingBoardsCount] = useScopedSetting(SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, k => /^[2-9]$/.test(k));

  const arrangement = BOARD_ARRANGEMENTS[arrangementKey] || BOARD_ARRANGEMENTS[DEFAULT_ARRANGEMENT];
  const bulletinStyle = BULLETIN_STYLES[bulletinStyleKey] || BULLETIN_STYLES[DEFAULT_BULLETIN];
  const wallStyle = wallBackgroundStyle(wallTypeKey, wallColorKey);
  const surface = surfaceColors(boardSurfaceKey);
  const slidingOn = slidingBoardsEnabled === "true";

  const selectWallType = (typeId) => {
    setWallTypeKey(typeId);
    setWallColorKey(DEFAULT_WALL_COLOR_BY_TYPE[typeId]);
  };

  const highlight = (id) => selected === id ? { boxShadow: "0 0 0 3px #E87722, 0 0 22px rgba(232,119,34,0.55)" } : {};

  // ── Preview pieces ──────────────────────────────────────────────────
  const slidesIsFirst = arrangement.order[0] === "slides";
  const slidesPreview = (
    <div key="slides" style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 10 }}>
      <div style={{ width: "100%", aspectRatio: "16/10", background: "#111", border: "4px solid #9a9a9a", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Oswald, sans-serif", fontSize: 16, color: "rgba(255,255,255,0.3)", letterSpacing: 1.5 }}>
        SLIDES
      </div>
    </div>
  );
  // When Sliding Boards is on, show the goals panel as a fanned stack of
  // boards (mirroring the real docked/fan-out look of ChalkboardBoardRow)
  // rather than a plain flat panel — a small corner icon alone didn't read
  // as "multiple boards" clearly enough to a user testing the setting.
  const showSlidingPreview = slidingOn && contentTemplateKey !== "fullAgenda";
  const stackCount = Math.min(parseInt(slidingBoardsCount, 10) || 3, 4);

  // Rather than absolutely-positioned "ghost" boards (which could bleed
  // outside their grid cell depending on layout direction), render the
  // stack as a simple row of solid spines beside the front panel — always
  // fully visible, in normal flow, regardless of which side the goals
  // column sits on.
  const spine = (key) => (
    <div key={key} style={{ width: 10, alignSelf: "stretch", background: surface.face, border: "2px solid #9a9a9a", borderRadius: 2 }} />
  );

  const frontPanel = (
    <div style={{
      flex: 1, minWidth: 0,
      display: "flex", flexDirection: "column", gap: 9,
      ...(showSlidingPreview ? { background: surface.face, border: "3px solid #9a9a9a", borderRadius: 3, padding: 12, boxShadow: "4px 4px 10px rgba(0,0,0,0.35)" } : {}),
    }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, color: surface.headerText, letterSpacing: 1.5, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: 6, display: "flex", justifyContent: "space-between" }}>
        <span>{contentTemplateKey === "fullAgenda" ? "Objectives & Benchmarks" : "Learning Goals"}</span>
        {showSlidingPreview && <span style={{ color: surface.placeholderText }}>1/{stackCount}</span>}
      </div>
      {SAMPLE_GOALS.slice(0, contentTemplateKey === "fullAgenda" ? 2 : 3).map((g, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
          <div style={{ width: 11, height: 11, marginTop: 2, borderRadius: 2, border: `2px solid ${surface.checkboxBorder}`, flexShrink: 0 }} />
          <span style={{ fontFamily: "Caveat, cursive", fontSize: 15, color: surface.bodyText, lineHeight: 1.3 }}>{g}</span>
        </div>
      ))}
      {contentTemplateKey === "fullAgenda" && (
        <>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 13, color: surface.headerText, letterSpacing: 1.5, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: 6, marginTop: 6 }}>
            Essential Question
          </div>
          <span style={{ fontFamily: "Caveat, cursive", fontSize: 15, color: surface.placeholderText, fontStyle: "italic" }}>Click to add...</span>
        </>
      )}
    </div>
  );

  const spines = showSlidingPreview
    ? Array.from({ length: stackCount - 1 }).map((_, i) => spine(`spine-${i}`))
    : [];

  const goalsPreview = (
    <div key="goals" style={{ minWidth: 0, padding: 14, display: "flex", gap: 4, alignItems: "stretch", ...(!showSlidingPreview ? { [slidesIsFirst ? "borderLeft" : "borderRight"]: `1px dashed ${surface.dividerBorder}` } : {}) }}>
      {/* Spines sit on the board's interior side (toward the slides), so
          they read as boards docked behind the front one, not clipped off
          the outer edge of the whole board frame. */}
      {slidesIsFirst && spines}
      {frontPanel}
      {!slidesIsFirst && spines}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#141414", fontFamily: "Lato, sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#1a1a1a", borderBottom: "4px solid #E87722", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "Oswald, sans-serif", color: "#fff", fontSize: 22, fontWeight: 600, letterSpacing: 1 }}>
          Board <span style={{ color: "#E87722" }}>Settings</span>
        </div>
        <a href="/" style={{ fontFamily: "Lato, sans-serif", fontSize: 12, fontWeight: 700, color: "#E87722", textDecoration: "none" }}>
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
            <div
              style={{ ...wallStyle, padding: 32, borderRadius: 8, transition: "background 0.2s", ...highlight("background") }}
            >
              <div style={{ border: "7px solid #8B6914", borderRadius: 5, overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}>
                {/* Bulletin strip */}
                <div style={{ background: bulletinStyle.background, minHeight: 48, position: "relative", ...highlight("bulletin") }}>
                  {bulletinStyle.trim && <div style={{ height: 8, backgroundImage: bulletinStyle.trim, backgroundRepeat: "repeat-x", backgroundSize: "22px 8px" }} />}
                </div>
                {/* Chalkboard */}
                <div style={{ background: surface.face, borderTop: "4px solid #6B4F10", position: "relative", ...highlight("blackboard"), ...highlight("content") }}>
                  <div style={{ ...highlight("layout"), display: "grid", gridTemplateColumns: arrangement.gridTemplateColumns, minHeight: 260 }}>
                    {arrangement.order.map(k => k === "slides" ? slidesPreview : goalsPreview)}
                  </div>
                </div>
                {/* Ledge / tray */}
                <div style={{ height: 9, background: surface.ledgeBg, borderTop: `2px solid ${surface.ledgeBorder}` }} />
              </div>
            </div>
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
                      {Object.values(BOARD_CONTENT_TEMPLATES).map(t => (
                        <RadioRow key={t.id} selected={contentTemplateKey === t.id} onClick={() => setContentTemplateKey(t.id)} label={t.label} />
                      ))}
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
                            Applies to lessons that don't already define their own boards (Unit 10's Testing lessons keep their own board count). Only affects the Simple Goals content template.
                          </div>
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
