// Shared board customization config — presets, storage keys, and the
// scoped-localStorage helper. Lives in its own module (rather than inside
// WebsterGrovesChemistry.jsx) because two separate pages now read/write
// this same state: the board itself (WebsterGrovesChemistry.jsx) and the
// new Settings page (SettingsPage.jsx), which opens in its own browser
// tab. Both pages persist to the same localStorage keys, and each tab
// picks up changes made in the *other* tab live via the browser's native
// `storage` event (see useScopedSetting below) — no backend needed for
// two tabs to stay in sync.

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/clerk-react";
import { fetchBoardSettings, saveBoardSetting } from "./lib/boardSettingsApi";

// Real identity now exists (Clerk — see main.jsx's <ClerkProvider> and
// useSyncAuthIdentity below), but the placeholder scheme this replaces
// (everything saved locally namespaced under an "active teacher id")
// stays exactly as it was — a signed-in teacher's Clerk user id just
// becomes the value that flows through it, prefixed with CLERK_ID_PREFIX
// so it can never collide with DEFAULT_TEACHER_ID or a ?teacher= sandbox
// value picked by hand. That's what keeps this a storage-layer change
// rather than a redesign: scopedKey, getActiveTeacherId, and everything
// that calls them (WebsterGrovesChemistry.jsx, BuildPage.jsx,
// lib/extraAssignments.js, api/assignments.js) didn't need to change.
//
// Homegrown-vs-publisher-SSO is still an open question (Jay: pitching
// publishers and going multi-teacher are "both, unclear priority" as of
// the 2026-08-23 login pass) — Clerk was picked specifically because it
// doesn't foreclose either path: it supports enterprise SSO connections
// (SAML/OIDC — Clever/Canvas-style) later without a rewrite, same as this
// id-prefix scheme doesn't foreclose swapping the source of the id.
//
// DEFAULT_TEACHER_ID is Webster Groves' real site — its hardcoded
// curriculum data and its localStorage-saved settings are never touched by
// switching identities, and it stays viewable with nobody signed in (the
// public pitch-demo path). Any OTHER teacher id gets a blank shell instead
// (see BLANK_CURRICULUM in WebsterGrovesChemistry.jsx) with its own
// separately-scoped settings — true whether that id came from a signed-in
// teacher or from hand-typing ?teacher=sandbox, which still works exactly
// as before (useful for Jay's own testing, or demoing "what a brand new
// teacher sees" without creating an account). The sticky value in
// localStorage is genuinely just "whichever identity should be active
// right now" — useSyncAuthIdentity below is the only new thing writing to
// it on its own, mirroring what typing ?teacher=... in the URL already did.
export const DEFAULT_TEACHER_ID = "local-teacher";
export const CLERK_ID_PREFIX = "clerk:";
const ACTIVE_TEACHER_STORAGE_KEY = "homeroom:activeTeacherId";

// Whether Clerk is actually set up (VITE_CLERK_PUBLISHABLE_KEY present —
// see .env.example). main.jsx only mounts <ClerkProvider> when this is
// true; every other file that wants to render a Clerk component (UserButton,
// SignedIn, ...) checks this first, since those components throw if
// rendered outside a <ClerkProvider>. False on a fresh checkout before
// .env.local is set up, or a deploy missing the env var — either way, the
// app should still run (just with no auth), not show a blank white screen.
export const CLERK_CONFIGURED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

export function getActiveTeacherId() {
  if (typeof window === "undefined") return DEFAULT_TEACHER_ID;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("teacher");
    if (fromUrl) {
      window.localStorage.setItem(ACTIVE_TEACHER_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return window.localStorage.getItem(ACTIVE_TEACHER_STORAGE_KEY) || DEFAULT_TEACHER_ID;
  } catch {
    return DEFAULT_TEACHER_ID;
  }
}

function setActiveTeacherId(id) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_TEACHER_STORAGE_KEY, id);
  } catch { /* ignore */ }
}

// Keeps the sticky active-teacher id in sync with Clerk's sign-in state —
// mounted once, near the root (see AuthIdentitySync in main.jsx), so every
// page that calls getActiveTeacherId() (the board, Build, Settings, the
// assignments API client) picks up a signed-in teacher's own id without
// each of them needing to know Clerk exists.
//
// Deliberately does nothing when a ?teacher= override is present in the
// URL — that's an explicit, higher-priority choice (Jay testing the blank
// shell, or a demo link), and a signed-in session shouldn't silently steal
// it back. On sign-out, only resets the sticky value if it's currently
// THIS user's own id — otherwise signing out of a Clerk session that
// isn't even the active identity (e.g. someone had switched to
// ?teacher=sandbox first) shouldn't yank them back to the public demo.
export function useSyncAuthIdentity() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("teacher")) return;

    const ownId = user ? `${CLERK_ID_PREFIX}${user.id}` : null;
    const current = getActiveTeacherId();

    if (isSignedIn && ownId && current !== ownId) {
      setActiveTeacherId(ownId);
    } else if (!isSignedIn && current?.startsWith(CLERK_ID_PREFIX)) {
      // A previous session's teacher id is still stuck as active but
      // nobody is signed in now (e.g. the session expired in this tab) —
      // fall back to the public demo rather than leaving a signed-out
      // visitor pointed at someone else's board.
      setActiveTeacherId(DEFAULT_TEACHER_ID);
    }
  }, [isLoaded, isSignedIn, user]);
}

export const scopedKey = (key) => `homeroom:${getActiveTeacherId()}:${key}`;

// ── Blank-shell theme (school/subject title + primary/secondary color) ──
// Added 2026-08-25, per Jay's ask on the sandbox: a blank-shell teacher's
// board should show THEIR school/subject as the title (replacing the
// hardcoded "Webster Groves Chemistry") and use colors THEY picked
// (replacing the hardcoded black/orange) — set once via the onboarding
// form (ProfileOnboarding.jsx) and saved to the same Mongo `profiles`
// document as their name/school/subject (api/profile.js).
//
// Deliberately scoped to blank-shell teachers only — DEFAULT_TEACHER_ID
// (the real Webster Groves pitch-demo site) never reads a saved profile
// for its title/colors and always uses these exact same two values as
// its literal defaults, so the demo is visually unchanged. That's also
// why these are plain exported constants rather than something baked
// into a teacher's profile as their "default" — a teacher who never
// touches the color pickers still gets a coherent black/orange look
// rather than an arbitrary one.
//
// These match every one of the ~60 hardcoded "#1a1a1a"/"#E87722"
// literals that used to be scattered across WebsterGrovesChemistry.jsx,
// BuildPage.jsx, BoardSettingsPanel.jsx, ChalkboardBoardRow.jsx, and
// FullAgendaBoard.jsx — all replaced with `var(--board-primary)` /
// `var(--board-secondary)` in that same pass, resolved via
// boardThemeVars() below on a wrapping element. api/profile.js validates
// any saved color against this same six-hex-digit shape before storing
// it (see sanitizeHexColor there), so a value read back from Mongo is
// always safe to hand straight to a CSS custom property.
export const DEFAULT_PRIMARY_COLOR = "#1a1a1a";
export const DEFAULT_SECONDARY_COLOR = "#E87722";

// A teacher can pick literally any two hex colors, which the original
// hardcoded black/orange never had to account for: black text always
// worked on the orange fills, white text always worked on the black
// fills. With arbitrary colors that assumption breaks (e.g. a light
// primary makes white title text disappear; a light secondary makes an
// accent-colored label disappear against the app's own dark chrome).
// These helpers compute safe derived colors so text stays legible
// regardless of what a teacher picks, without needing every call site to
// reason about contrast itself.
function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return [26, 26, 26];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relativeLuminance([r, g, b]) {
  const chan = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
function blendToward(rgb, target, amount) {
  return rgb.map((c, i) => Math.round(c + (target[i] - c) * amount));
}
function toHex(rgb) {
  return "#" + rgb.map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("");
}
// A foreground color (near-black or near-white) guaranteed to read on
// top of a SOLID FILL of `hex` — for text/icons sitting directly on a
// var(--board-primary)/var(--board-secondary) background.
function readableForeground(hex) {
  return relativeLuminance(hexToRgb(hex)) > 0.5 ? "#1a1a1a" : "#ffffff";
}
// A variant of `hex` clamped into a legible middle luminance band — for
// when a color is used as an ACCENT (a label, a checkmark, a selection
// indicator) against this app's own fixed dark chrome (settings panels,
// dropdowns) rather than as a background the surrounding text was
// designed around. Too-dark colors get lightened, too-light colors get
// darkened, so the accent stays visible either way; anything already in
// a reasonable range passes through unchanged.
function accentSafe(hex) {
  const rgb = hexToRgb(hex);
  const lum = relativeLuminance(rgb);
  if (lum < 0.25) return toHex(blendToward(rgb, [255, 255, 255], 0.4));
  if (lum > 0.75) return toHex(blendToward(rgb, [0, 0, 0], 0.4));
  return hex;
}

// Ready-to-spread style object defining the CSS custom properties every
// themed inline style in this codebase reads via var(--board-...). Call
// this once on whichever element is the root of a themed subtree (the
// board's outermost div, Build page's outermost div, ...) — CSS custom
// properties inherit down through the DOM like any other inherited
// property, so nothing further down needs its own copy.
export function boardThemeVars(primaryColor, secondaryColor) {
  const primary = primaryColor || DEFAULT_PRIMARY_COLOR;
  const secondary = secondaryColor || DEFAULT_SECONDARY_COLOR;
  return {
    "--board-primary": primary,
    "--board-secondary": secondary,
    // Text/icon color for anything sitting on a solid --board-primary or
    // --board-secondary fill (title text on the primary title bar, a
    // button's own label on a secondary-filled button, ...).
    "--board-primary-fg": readableForeground(primary),
    "--board-secondary-fg": readableForeground(secondary),
    // The secondary color, clamped so it stays visible as an accent
    // (selected-state text, a checkmark, a highlighted label) against
    // this app's own fixed dark UI chrome — used instead of the raw
    // secondary wherever a teacher's color is a label/indicator rather
    // than a background fill.
    "--board-secondary-accent": accentSafe(secondary),
  };
}

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

// ── A blank-shell teacher's course calendar ─────────────────────────────
// Webster Groves' unit overview screen shows one hardcoded Google Calendar
// embed (CALENDAR_SRC in WebsterGrovesChemistry.jsx) in the spot the
// smartboard occupies during a lesson. A teacher starting from the blank
// shell doesn't have one yet, so that same spot shows an "+ Add Calendar"
// affordance instead — this is where its saved URL lives once they add
// one. Same localStorage-only pattern as every other board setting today
// (per-browser, not per-account); could move to Mongo later like
// assignments did if cross-device persistence turns out to matter here.
export const CALENDAR_URL_STORAGE_KEY = "calendarUrl";

export function readCalendarUrl() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(scopedKey(CALENDAR_URL_STORAGE_KEY)) || "";
  } catch {
    return "";
  }
}

export function writeCalendarUrl(url) {
  if (typeof window === "undefined") return;
  try {
    if (!url) {
      window.localStorage.removeItem(scopedKey(CALENDAR_URL_STORAGE_KEY));
    } else {
      window.localStorage.setItem(scopedKey(CALENDAR_URL_STORAGE_KEY), url);
    }
  } catch { /* ignore */ }
}

// ── Per-lesson slides override ──────────────────────────────────────────
// A lesson's slides normally come straight from the hardcoded curriculum
// data (`lesson.slides`, an embed URL — a Google Slides "publish to web"
// link or similar). A blank-shell lesson starts with `slides: null`, so
// this is where a URL pasted in via the Build page's "+ Add Slides/
// Presentation" tile lives instead — same one-URL-per-slot, localStorage-
// only pattern as the course calendar above. Scoped by unit index + lesson
// title (unique within a unit today) rather than a stable lesson id,
// since lessons aren't objects with ids yet. Embedding a "publish to web"
// URL this way means slide changes made later in Google Slides show up on
// the board automatically with zero extra integration — the iframe just
// always loads whatever the source document currently contains.
export function readLessonSlidesUrl(unitIdx, lessonTitle) {
  if (typeof window === "undefined" || unitIdx == null || !lessonTitle) return "";
  try {
    return window.localStorage.getItem(scopedKey(`lessonSlides:${unitIdx}:${lessonTitle}`)) || "";
  } catch {
    return "";
  }
}

export function writeLessonSlidesUrl(unitIdx, lessonTitle, url) {
  if (typeof window === "undefined" || unitIdx == null || !lessonTitle) return;
  const key = scopedKey(`lessonSlides:${unitIdx}:${lessonTitle}`);
  try {
    if (!url) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, url);
  } catch { /* ignore */ }
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

// ── Board content components ────────────────────────────────────────────
// Separate axis from arrangement/bulletin above (those are purely
// cosmetic; this changes what's actually on the board). Used to be one
// all-or-nothing "Simple Goals vs. Full Agenda" template choice; replaced
// with five independent on/off toggles — one storage key per component,
// same "cross-tab-synced setting" pattern as Sliding Boards' on/off
// switch — so a teacher can build whatever combination of board content
// their admin's format actually calls for (e.g. just the checklist, or
// checklist + Essential Question with Agenda/Bell Ringer/Home Learning
// left off) instead of only ever getting the two fixed combinations that
// used to be available. See FullAgendaBoard.jsx for the fields
// themselves.
//
// `default` matches the old "Simple Goals" look (goals checklist only),
// so a teacher who never opens Settings sees exactly what they always
// have — the four extra fields are opt-in on a fresh install, not a
// surprise change to every existing board.
export const BOARD_COMPONENTS = {
  learningGoals: { id: "learningGoals", label: "Learning Goals", storageKey: "component:learningGoals", default: "true" },
  essentialQuestion: { id: "essentialQuestion", label: "Essential Question", storageKey: "component:essentialQuestion", default: "false" },
  agenda: { id: "agenda", label: "Agenda", storageKey: "component:agenda", default: "false" },
  bellRinger: { id: "bellRinger", label: "Bell Ringer", storageKey: "component:bellRinger", default: "false" },
  homeLearning: { id: "homeLearning", label: "Home Learning", storageKey: "component:homeLearning", default: "false" },
};

// ── Board content order ─────────────────────────────────────────────────
// Which of the five BOARD_COMPONENTS above renders first, second, etc. in
// the flat (non-sliding) goals column — independent of which ones are ON,
// so a component still has a place in line while toggled off, and turning
// it back on later doesn't silently bump it back to the end. Only the
// flat board content column reads this; Sliding Boards mode keeps its own
// fixed order (Learning Goals, then the four freeform fields in this same
// default sequence) regardless of what a teacher sets here — a smaller
// scope than the flat case, flagged as a follow-up rather than blocking
// this on rebuilding the sliding-boards rendering path too.
export const BOARD_CONTENT_ORDER_STORAGE_KEY = "boardContentOrder";
export const DEFAULT_BOARD_CONTENT_ORDER = ["learningGoals", "essentialQuestion", "agenda", "bellRinger", "homeLearning"];

function isValidBoardContentOrder(raw) {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== DEFAULT_BOARD_CONTENT_ORDER.length) return false;
    const want = new Set(DEFAULT_BOARD_CONTENT_ORDER);
    return arr.every(k => want.has(k)) && new Set(arr).size === arr.length;
  } catch {
    return false;
  }
}

// Cross-tab-synced exactly like useScopedSetting (same storage key/
// `storage`-event mechanism), just with a JSON-encoded array instead of a
// bare string at the boundary, since a component order isn't a single
// value the way a preset id is.
export function useBoardContentOrder() {
  const [raw, setRaw] = useScopedSetting(
    BOARD_CONTENT_ORDER_STORAGE_KEY,
    JSON.stringify(DEFAULT_BOARD_CONTENT_ORDER),
    isValidBoardContentOrder
  );
  let order;
  try {
    order = JSON.parse(raw);
  } catch {
    order = DEFAULT_BOARD_CONTENT_ORDER;
  }
  const setOrder = (nextOrder) => setRaw(JSON.stringify(nextOrder));
  return [order, setOrder];
}

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
// "1" is the unified stand-in for "off" (a single flat board, no
// sliding) in the Board Content settings UI (see BoardSettingsPanel
// .jsx) -- there is no separate on/off toggle anymore, just a single
// Number of Boards control; picking 1 board IS off.
export const SLIDING_BOARDS_COUNT_OPTIONS = ["1", "2", "3", "4", "5"];

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
  const n = Math.max(1, count);
  // Board count is a fixed setting, not a maximum -- always return exactly
  // n panels, even when there are fewer goals than boards (or none at
  // all). A board with no goals on it isn't broken; it's just a blank
  // board, which is a perfectly normal thing for a teacher to want (room
  // for freehand notes, or a board that's only carrying an Agenda/Bell
  // Ringer field). Previously this filtered out empty buckets, so the
  // number of boards a lesson actually showed silently shrank whenever it
  // had fewer goals than the configured count -- see the removed warning
  // in BoardSettingsPanel.jsx for the UI that used to explain that away
  // instead of just not doing it.
  const lessonPanelKey = goalItems[0]?.panelKey;
  const buckets = Array.from({ length: n }, () => []);
  goalItems.forEach((item, i) => {
    buckets[i % n].push(item);
  });
  return buckets
    .map((items, i) => ({
      label: `Board ${i + 1}`,
      panelKey: lessonPanelKey,
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
//
// Also mirrors to Mongo (api/boardSettings.js) now, same dual-write shape
// as useFullAgendaFields/checkedGoals: localStorage stays the first,
// synchronous write (and the only one a fresh page load reads from before
// the remote fetch below resolves), Mongo is purely additive on top so a
// teacher's board still looks right on a different device or after a
// cleared cache. One shared per-teacher fetch (see
// getRemoteBoardSettingsOnce below) backs every useScopedSetting call on
// the page, so ~10 settings don't turn into ~10 GET requests.
export function useScopedSetting(storageKeyName, defaultValue, isValid) {
  const key = scopedKey(storageKeyName);
  const teacherId = getActiveTeacherId();

  const read = useCallback(() => {
    if (typeof window === "undefined") return defaultValue;
    const saved = window.localStorage.getItem(key);
    return saved && (!isValid || isValid(saved)) ? saved : defaultValue;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const [value, setValue] = useState(read);
  // Gates the Mongo write-through below until the one-time remote fetch
  // has had a chance to run — otherwise a fresh mount's first render
  // (local default or stale localStorage) would immediately overwrite
  // whatever a different device already saved, before remote data ever
  // gets a chance to merge in.
  const hasLoadedRemote = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
    if (hasLoadedRemote.current) {
      saveBoardSetting(teacherId, storageKeyName, value).catch(() => {});
    }
  }, [key, value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== key || e.newValue == null) return;
      if (!isValid || isValid(e.newValue)) setValue(e.newValue);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key, isValid]);

  useEffect(() => {
    let cancelled = false;
    getRemoteBoardSettingsOnce(teacherId)
      .then((remote) => {
        if (cancelled) return;
        const remoteValue = remote ? remote[storageKeyName] : null;
        if (typeof remoteValue === "string" && (!isValid || isValid(remoteValue))) {
          setValue(remoteValue);
        }
      })
      .finally(() => { if (!cancelled) hasLoadedRemote.current = true; });
    return () => { cancelled = true; };
  }, [teacherId, storageKeyName]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue];
}

// One in-flight/resolved fetch per teacherId, shared across every
// useScopedSetting instance mounted at the same time (a page can easily
// have 10+ of them) — without this, each would fire its own identical GET
// to /api/boardSettings on mount. Deliberately module-level (not a React
// cache) since this data isn't component-scoped; cleared implicitly on a
// full page reload, which is fine — a stale in-memory copy only matters
// within one page's lifetime, and localStorage/the `storage` event still
// handle same-session cross-tab sync same as before.
const boardSettingsFetchCache = new Map();
function getRemoteBoardSettingsOnce(teacherId) {
  if (!boardSettingsFetchCache.has(teacherId)) {
    boardSettingsFetchCache.set(teacherId, fetchBoardSettings(teacherId).catch(() => null));
  }
  return boardSettingsFetchCache.get(teacherId);
}
