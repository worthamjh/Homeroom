// Shared board customization config — presets, storage keys, and the
// scoped-localStorage helper. Lives in its own module (rather than inside
// WebsterGrovesChemistry.jsx) because two separate pages now read/write
// this same state: the board itself (WebsterGrovesChemistry.jsx) and the
// new Settings page (SettingsPage.jsx), which opens in its own browser
// tab. Both pages persist to the same localStorage keys, and each tab
// picks up changes made in the *other* tab live via the browser's native
// `storage` event (see useScopedSetting below) — no backend needed for
// two tabs to stay in sync.

import { useState, useEffect, useCallback } from "react";

// Placeholder for real identity (teacher/classroom account) — there's no
// login yet, and building one now would likely just get thrown out once
// this plugs into a publisher's actual SSO (Clever/Canvas, already in the
// footer links) rather than a homegrown one. But everything saved locally
// (customizations, goal-completion) is namespaced under this ID now, so
// swapping it for a real logged-in user ID later is a storage-layer
// change, not a redesign of how state is shaped.
export const CURRENT_USER_ID = "local-teacher";
export const scopedKey = (key) => `homeroom:${CURRENT_USER_ID}:${key}`;

// ── "Currently open lesson" — read by the Settings page's live preview ──
// The Settings page (SettingsPage.jsx) opens in its own tab and renders an
// actual embedded copy of the board (an iframe on "/?preview=1") rather
// than a hand-built mockup, so every setting's real effect — including
// ones a mockup could never get right, like how many goals actually land
// in each sliding board — shows up exactly as it would on the real board.
// For that embedded copy to open on the SAME lesson the teacher actually
// has up (matching what "← Back to the board" returns to), the real board
// tab writes what it's currently looking at here every time it navigates;
// the preview iframe reads it once on load and then keeps listening for
// live updates via the same `storage` event useScopedSetting relies on.
// Unlike useScopedSetting's keys, this is deliberately one-way — only the
// real board tab ever writes it. The preview iframe only reads.
export const CURRENT_VIEW_STORAGE_KEY = "currentView";

export function writeCurrentView(view) {
  if (typeof window === "undefined") return;
  const key = scopedKey(CURRENT_VIEW_STORAGE_KEY);
  try {
    if (view == null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(view));
    }
  } catch { /* ignore */ }
}

export function readCurrentView() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(CURRENT_VIEW_STORAGE_KEY));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Board arrangement presets ───────────────────────────────────────────
// `order` controls which side (slides vs goals) renders first;
// `gridTemplateColumns` should list widths in that same order.
export const BOARD_ARRANGEMENTS = {
  classic: { id: "classic", label: "Classic (Slides Left)", gridTemplateColumns: "3fr 2fr", order: ["slides", "goals"] },
  inverse: { id: "inverse", label: "Inverse (Slides Right)", gridTemplateColumns: "2fr 3fr", order: ["goals", "slides"] },
};
export const DEFAULT_ARRANGEMENT = "classic";
export const ARRANGEMENT_STORAGE_KEY = "boardArrangement";

// ── Bulletin strip presets ──────────────────────────────────────────────
// `trim`, when set, is a small repeating SVG tile drawn along the top and
// bottom edges of the strip.
const DOT_TRIM = (dot, bg) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='12'><rect width='24' height='12' fill='${bg}'/><circle cx='6' cy='6' r='3' fill='${dot}'/><circle cx='18' cy='6' r='3' fill='${dot}'/></svg>`
  )}")`;

export const BULLETIN_STYLES = {
  navy: { id: "navy", label: "Navy (Classic)", background: "#1a2a4a", trim: null },
  orange: { id: "orange", label: "Webster Orange", background: "#E87722", trim: null },
  black: { id: "black", label: "Chalkboard Black", background: "#1a1a1a", trim: null },
  navyTrim: { id: "navyTrim", label: "Navy + Orange Trim", background: "#1a2a4a", trim: DOT_TRIM("#E87722", "#1a1a1a") },
  orangeTrim: { id: "orangeTrim", label: "Orange + Black Trim", background: "#E87722", trim: DOT_TRIM("#1a1a1a", "#E87722") },
};
export const DEFAULT_BULLETIN = "navy";
export const BULLETIN_STORAGE_KEY = "bulletinStyle";

// ── Board content presets ───────────────────────────────────────────────
// Separate axis from arrangement/bulletin above (those are purely
// cosmetic; this changes what's actually on the board). See
// FullAgendaBoard.jsx for the Full Agenda template itself.
export const BOARD_CONTENT_TEMPLATES = {
  simpleGoals: { id: "simpleGoals", label: "Simple Goals (Slides + Checklist)" },
  fullAgenda: { id: "fullAgenda", label: "Full Agenda (Objectives, Agenda...)" },
};
export const DEFAULT_CONTENT_TEMPLATE = "simpleGoals";
export const CONTENT_TEMPLATE_STORAGE_KEY = "boardContentTemplate";

export const GOALS_STORAGE_KEY = "checkedGoals";

// ── Background / wall presets ───────────────────────────────────────────
// Two axes, same "presets first" approach as everything else: wall Type
// (cinderblock's textured coursing vs. drywall's flat surface) and a
// short list of Color swatches specific to that type. Cinderblock's
// texture is a tiled SVG of mortar-joint lines, generated per swatch
// (base fill + line color) rather than a single fixed image, so a new
// cinderblock color is still real coursing, not just a flat tint.
export const WALL_TYPES = {
  cinderblock: { id: "cinderblock", label: "Cinderblock" },
  drywall: { id: "drywall", label: "Drywall" },
};
export const DEFAULT_WALL_TYPE = "cinderblock";
export const WALL_TYPE_STORAGE_KEY = "wallType";

export const WALL_COLORS = {
  cinderblock: [
    { id: "tan", label: "Tan (Classic)", base: "#ded6c0", line: "#c2b89e" },
    { id: "gray", label: "Gray", base: "#c9c9c9", line: "#a8a8a8" },
    { id: "blueGray", label: "Blue-Gray", base: "#c3cdd4", line: "#a3b0b9" },
  ],
  drywall: [
    { id: "white", label: "White", base: "#f0ede6" },
    { id: "lightGray", label: "Light Gray", base: "#d9d9d6" },
    { id: "cream", label: "Cream", base: "#eee3cf" },
  ],
};
export const DEFAULT_WALL_COLOR_BY_TYPE = { cinderblock: "tan", drywall: "white" };
export const WALL_COLOR_STORAGE_KEY = "wallColor";

function cinderblockTileSvg(lineColor) {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>
    <line x1='0' y1='0' x2='0' y2='80' stroke='${lineColor}' stroke-width='2'/>
    <line x1='160' y1='0' x2='160' y2='80' stroke='${lineColor}' stroke-width='2'/>
    <line x1='0' y1='80' x2='160' y2='80' stroke='${lineColor}' stroke-width='2'/>
    <line x1='80' y1='80' x2='80' y2='160' stroke='${lineColor}' stroke-width='2'/>
    <line x1='0' y1='160' x2='160' y2='160' stroke='${lineColor}' stroke-width='2'/>
  </svg>`;
}

export function wallColorSwatch(wallTypeKey, wallColorKey) {
  const type = WALL_COLORS[wallTypeKey] ? wallTypeKey : DEFAULT_WALL_TYPE;
  const palette = WALL_COLORS[type];
  return palette.find(s => s.id === wallColorKey) || palette.find(s => s.id === DEFAULT_WALL_COLOR_BY_TYPE[type]) || palette[0];
}

// Returns a ready-to-spread style object (background/backgroundImage/
// backgroundSize) for the room's wall, given the selected wall type +
// color preset ids.
export function wallBackgroundStyle(wallTypeKey, wallColorKey) {
  const type = WALL_TYPES[wallTypeKey] ? wallTypeKey : DEFAULT_WALL_TYPE;
  const swatch = wallColorSwatch(type, wallColorKey);
  if (type === "cinderblock") {
    return {
      background: swatch.base,
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(cinderblockTileSvg(swatch.line))}")`,
      backgroundSize: "160px 80px",
    };
  }
  return { background: swatch.base, backgroundImage: "none", backgroundSize: undefined };
}

// ── Blackboard / board surface presets ──────────────────────────────────
// What the writing surface itself looks like (independent of what
// content template is showing on it). "Sliding Boards" is the physical
// multi-panel sliding-chalkboard mechanic (see ChalkboardBoardRow.jsx) —
// originally built just for Unit 10's dev-scaffolding "Testing" lessons,
// now a real setting: when on, any lesson's Objectives/Learning Goals
// checklist renders as N sliding panels instead of one flat list. A
// lesson that authors its own explicit `goalPanels` (still just Unit 10
// today) always uses those panels as-is when Sliding Boards is on —
// the panel *count* setting only drives auto-splitting for lessons that
// don't author their own panels.
export const BOARD_SURFACES = {
  chalkboard: { id: "chalkboard", label: "Chalkboard (Green)" },
  dryErase: { id: "dryErase", label: "Dry Erase / Whiteboard" },
};
export const DEFAULT_BOARD_SURFACE = "chalkboard";
export const BOARD_SURFACE_STORAGE_KEY = "boardSurface";

export const SLIDING_BOARDS_ENABLED_KEY = "slidingBoardsEnabled";
export const DEFAULT_SLIDING_BOARDS_ENABLED = "false";
export const SLIDING_BOARDS_COUNT_KEY = "slidingBoardsCount";
export const DEFAULT_SLIDING_BOARDS_COUNT = "3";
export const SLIDING_BOARDS_COUNT_OPTIONS = ["2", "3", "4", "5"];

// Splits a flat goalItems list (each { text, panelKey, idx }, see the
// goalItems derivation in WebsterGrovesChemistry.jsx's App()) into N
// sliding-chalkboard panels, for lessons that don't author their own
// explicit `goalPanels` (i.e. every lesson except Unit 10's Testing
// lessons today). Each resulting item carries its *original* idx and a
// shared panelKey (the lesson title) rather than a fresh per-panel index,
// so checking a goal while Sliding Boards is on stays in sync with the
// same goal shown in the flat Learning Goals checklist / Full Agenda
// Objectives section when Sliding Boards is off — one shared checked-state
// namespace, not one per panel. Used by both the sliding chalkboard
// (ChalkboardBoardRow, via WebsterGrovesChemistry.jsx) and Full Agenda's
// Objectives & Benchmarks checklist (FullAgendaBoard.jsx) so Sliding
// Boards behaves consistently under either content template.
export function buildSlidingPanels(goalItems, count) {
  if (goalItems.length === 0) return [{ label: undefined, goals: [] }];
  const n = Math.max(1, count);
  const buckets = Array.from({ length: n }, () => []);
  goalItems.forEach((item, i) => {
    buckets[i % n].push(item);
  });
  return buckets
    .filter(b => b.length > 0)
    .map((items, i) => ({
      label: `Board ${i + 1}`,
      panelKey: items[0].panelKey,
      goals: items.map(it => ({ text: it.text, idx: it.idx })),
    }));
}

// Text/background colors for the two board surfaces — chalkboard is light
// text on a dark green face (chalk), dry erase is dark text on a light
// face (marker). Consumed by the goals checklist, FullAgendaBoard, and
// ChalkboardBoardRow so all three read the same surface.
export function surfaceColors(boardSurfaceKey) {
  if (boardSurfaceKey === "dryErase") {
    return {
      face: "#f7f7f4",
      ledgeBg: "#d8d8d3",
      ledgeBorder: "#b3b3ac",
      accent: "#c9622b",
      headerText: "rgba(30,30,30,0.65)",
      bodyText: "rgba(20,20,20,0.85)",
      bodyTextChecked: "rgba(20,20,20,0.32)",
      placeholderText: "rgba(20,20,20,0.4)",
      dividerBorder: "rgba(0,0,0,0.15)",
      textShadow: "none",
      checkboxBorder: "rgba(0,0,0,0.35)",
    };
  }
  return {
    face: "#2d5a2d",
    ledgeBg: "#5c3d0e",
    ledgeBorder: "#3a2408",
    accent: "#E87722",
    headerText: "rgba(255,255,255,0.6)",
    bodyText: "rgba(255,255,255,0.85)",
    bodyTextChecked: "rgba(255,255,255,0.3)",
    placeholderText: "rgba(255,255,255,0.4)",
    dividerBorder: "rgba(255,255,255,0.15)",
    textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
    checkboxBorder: "rgba(255,255,255,0.4)",
  };
}

// ── Cross-tab-synced setting ────────────────────────────────────────────
// A small string-valued setting (a preset id) persisted to a scoped
// localStorage key, that also live-updates when the *same* key changes
// in another tab. This is what makes "open Settings in a new tab, change
// something, watch the board tab update" work with no backend: the
// browser's `storage` event fires in every other same-origin tab
// whenever localStorage is written (never in the tab that wrote it),
// so each tab just listens for the one key it cares about.
export function useScopedSetting(storageKeyName, defaultValue, isValid) {
  const key = scopedKey(storageKeyName);

  const read = useCallback(() => {
    if (typeof window === "undefined") return defaultValue;
    const saved = window.localStorage.getItem(key);
    return saved && (!isValid || isValid(saved)) ? saved : defaultValue;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const [value, setValue] = useState(read);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
  }, [key, value]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== key || e.newValue == null) return;
      if (!isValid || isValid(e.newValue)) setValue(e.newValue);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key, isValid]);

  return [value, setValue];
}
