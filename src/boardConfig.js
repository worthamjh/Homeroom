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

// ── Per-teacher font customization ──────────────────────────────────────
// Two font axes: a heading font (Oswald-style display face — used for the
// board title, unit nav, and other structural labels) and a body font
// (Lato-style reading face — used for lesson titles, goal text, and
// descriptive content). Both are persisted in the teacher's Mongo profile
// alongside colors, and injected as CSS custom properties
// (--board-heading-font / --board-body-font) on the board's root element
// via boardThemeVars() so they inherit everywhere without touching every
// inline-style call site individually. Blank-shell teachers only — the
// Webster Groves demo always uses Oswald/Lato so the pitch demo is stable.
export const DEFAULT_HEADING_FONT = "Oswald";
export const DEFAULT_BODY_FONT    = "Lato";

export const HEADING_FONT_OPTIONS = [
  { id: "Oswald",     label: "Oswald (Default)" },
  { id: "Bebas Neue", label: "Bebas Neue" },
  { id: "Raleway",    label: "Raleway" },
  { id: "Montserrat", label: "Montserrat" },
  { id: "Anton",      label: "Anton" },
  { id: "Fjalla One", label: "Fjalla One" },
];

export const BODY_FONT_OPTIONS = [
  { id: "Lato",           label: "Lato (Default)" },
  { id: "Open Sans",      label: "Open Sans" },
  { id: "Roboto",         label: "Roboto" },
  { id: "Nunito",         label: "Nunito" },
  { id: "Source Sans 3",  label: "Source Sans 3" },
  { id: "Inter",          label: "Inter" },
];

// Injects a Google Fonts <link> for any non-default custom font chosen by
// the teacher — called from boardThemeVars() so the load fires in the same
// render pass that sets the CSS vars. No-ops if the <link> is already in
// the document (id-gated), so safe to call on every re-render. The default
// fonts (Oswald / Lato) are pre-loaded in index.html and excluded here.
export function ensureFontsLoaded(fontNames) {
  if (typeof window === "undefined") return;
  fontNames.filter(Boolean).forEach(name => {
    const id = "gf-" + name.toLowerCase().replace(/\s+/g, "-");
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id   = id;
    link.rel  = "stylesheet";
    // ital,wght axis covers normal 400/600/700 — enough for the board's
    // uses without pulling every possible variant.
    link.href = "https://fonts.googleapis.com/css2?family=" +
      encodeURIComponent(name) + ":wght@400;600;700&display=swap";
    document.head.appendChild(link);
  });
}

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
// Contrast ratio between two colors, WCAG 2.x: (L1 + 0.05) / (L2 + 0.05)
// with L1 the lighter of the two. 1 = identical, 21 = black on white.
function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexToRgb(hexA));
  const b = relativeLuminance(hexToRgb(hexB));
  return a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);
}

// `hex` nudged toward white or black -- whichever direction the
// background leaves room for -- until it clears `minRatio` against that
// background. Returns `hex` untouched when it already does.
//
// This is what accentSafe() below CANNOT do, and the difference matters.
// accentSafe clamps into a fixed luminance band, because the thing it
// protects against is the app's own dark chrome, which never changes. A
// board surface does change -- green chalkboard, near-black chalkboard,
// near-white dry erase -- so one accent can be perfectly legible on one
// surface and invisible on the next. Only measuring against the actual
// surface catches that (Jay: "i want to make sure that no matter what the
// color will show well against the background, that is the most
// important").
//
// Blending toward pure white or pure black does not rotate hue, so a
// teacher's red still reads as red -- just lighter or darker than the one
// they picked. The step loop is outermost so the SMALLEST correction that
// works wins, whichever direction it came from, rather than always
// preferring one direction.
//
// 4.5 is WCAG AA for normal-size text. These headers are 12px, so the
// looser large-text 3.0 would not honestly apply.
export function readableOn(hex, background, minRatio = 4.5) {
  if (contrastRatio(hex, background) >= minRatio) return hex;
  const base = hexToRgb(hex);
  let best = hex;
  let bestRatio = contrastRatio(hex, background);
  for (let amount = 0.05; amount <= 1.0001; amount += 0.05) {
    for (const target of [[255, 255, 255], [0, 0, 0]]) {
      const candidate = toHex(blendToward(base, target, amount));
      const ratio = contrastRatio(candidate, background);
      if (ratio >= minRatio) return candidate;
      if (ratio > bestRatio) { bestRatio = ratio; best = candidate; }
    }
  }
  // Only reachable for a background so mid-grey that neither pure white
  // nor pure black clears the bar. Hand back the best of what we tried
  // rather than something known-worse.
  return best;
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
export function boardThemeVars(primaryColor, secondaryColor, headingFont, bodyFont) {
  const primary   = primaryColor   || DEFAULT_PRIMARY_COLOR;
  const secondary = secondaryColor || DEFAULT_SECONDARY_COLOR;
  const heading   = headingFont    || DEFAULT_HEADING_FONT;
  const body      = bodyFont       || DEFAULT_BODY_FONT;
  // Inject Google Fonts for any non-default teacher font choice.
  ensureFontsLoaded([
    heading !== DEFAULT_HEADING_FONT ? heading : null,
    body    !== DEFAULT_BODY_FONT    ? body    : null,
  ]);
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
    "--board-heading-font": "'" + heading + "', sans-serif",
    "--board-body-font":    "'" + body    + "', sans-serif",
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
export function readLessonSlidesUrl(unitTitle, lessonTitle) {
  if (typeof window === "undefined" || !unitTitle || !lessonTitle) return "";
  try {
    return window.localStorage.getItem(scopedKey(`lessonSlides:${unitTitle}:${lessonTitle}`)) || "";
  } catch {
    return "";
  }
}

export function writeLessonSlidesUrl(unitTitle, lessonTitle, url) {
  if (typeof window === "undefined" || !unitTitle || !lessonTitle) return;
  const key = scopedKey(`lessonSlides:${unitTitle}:${lessonTitle}`);
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

// ── Bulletin strip presets ──────────────────────────────────────
// `trim`, when set, is a small repeating SVG tile drawn along the top and
// bottom edges of the strip.
//
// The colours come from the TEACHER'S PROFILE (primary/secondary) rather
// than being hardcoded. They used to be five fixed presets built out of
// Webster Groves' own navy/orange/black, which meant a teacher at any
// other school chose between three colours, none of which were theirs
// (Jay: "Can we make it so the color scheme matches the school colors
// (primary secondary) selected in the profile").
//
// Hence a FUNCTION of (primary, secondary) rather than a constant object.
// The ids stay fixed even though the colours do not -- BULLETIN_STYLE_IDS
// below is what validates a saved setting, so validation never has to know
// what colour a board happens to be using today.
//
// Navy stays on as the one school-agnostic neutral. It is not derivable
// from the two profile colours (it is a third colour, and never was in the
// profile), and dropping it would have moved every board already using it
// -- including Jay's, which is on Navy today.
const DOT_TRIM = (dot, bg) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='12'><rect width='24' height='12' fill='${bg}'/><circle cx='6' cy='6' r='3' fill='${dot}'/><circle cx='18' cy='6' r='3' fill='${dot}'/></svg>`
  )}")`;

export const NEUTRAL_BULLETIN_NAVY = "#1a2a4a";
// The scalloped paper border strip that runs around the inside of a real
// classroom bulletin board (Jay: "this style of border on the inside of a
// bulletin board is a classic school type of thing"). Plain for now --
// the polka-dot version of the same shape is the obvious follow-on.
//
// One tile PER EDGE rather than one tile rotated, because the scallops
// have to bulge INWARD on all four sides and a rotated tile would send
// two of them outward.
//
// Drawn as circles centred exactly on the band's inner edge, not as arc
// paths: half of each circle then falls behind the solid band and half
// stands proud of it, which is precisely a scallop, with no arc sweep
// flags to get backwards. The tile is transparent apart from the border
// itself, so the strip's own colour shows through between the bumps.
export const SCALLOP_BAND = 14;             // band thickness, px
const SCALLOP_TILE = SCALLOP_BAND * 2;      // two scallops per tile
function scallopTile(color, edge) {
  const t = SCALLOP_BAND;
  const r = t / 2;
  const horizontal = edge === "top" || edge === "bottom";
  const w = horizontal ? SCALLOP_TILE : t;
  const h = horizontal ? t : SCALLOP_TILE;
  // The solid part hugs the OUTER edge; the circles sit on its inner line.
  const rect =
    edge === "top"    ? `<rect width='${w}' height='${r}'/>` :
    edge === "bottom" ? `<rect y='${r}' width='${w}' height='${r}'/>` :
    edge === "left"   ? `<rect width='${r}' height='${h}'/>` :
                        `<rect x='${r}' width='${r}' height='${h}'/>`;
  const circles = horizontal
    ? `<circle cx='${r}' cy='${r}' r='${r}'/><circle cx='${r * 3}' cy='${r}' r='${r}'/>`
    : `<circle cx='${r}' cy='${r}' r='${r}'/><circle cx='${r}' cy='${r * 3}' r='${r}'/>`;
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' fill='${color}'>${rect}${circles}</svg>`
  )}")`;
}
function scallopTiles(color) {
  return {
    band: SCALLOP_BAND,
    // Needed as a plain colour too, for the solid corner patches where the
    // strips overlap -- see the bulletin strip in WebsterGrovesChemistry.
    color,
    top: scallopTile(color, "top"),
    bottom: scallopTile(color, "bottom"),
    left: scallopTile(color, "left"),
    right: scallopTile(color, "right"),
  };
}


export function bulletinStyles(primaryColor, secondaryColor) {
  const primary   = primaryColor   || DEFAULT_PRIMARY_COLOR;
  const secondary = secondaryColor || DEFAULT_SECONDARY_COLOR;
  return {
    primary:       { id: "primary",       label: "Primary Color",         background: primary,   trim: null },
    secondary:     { id: "secondary",     label: "Accent Color",          background: secondary, trim: null },
    primaryTrim:   { id: "primaryTrim",   label: "Primary + Accent Trim", background: primary,   trim: DOT_TRIM(secondary, primary) },
    secondaryTrim: { id: "secondaryTrim", label: "Accent + Primary Trim", background: secondary, trim: DOT_TRIM(primary, secondary) },
    primaryScallop:   { id: "primaryScallop",   label: "Primary + Accent Scallop", background: primary,   trim: null, scallop: scallopTiles(secondary) },
    secondaryScallop: { id: "secondaryScallop", label: "Accent + Primary Scallop", background: secondary, trim: null, scallop: scallopTiles(primary) },
    navy:          { id: "navy",          label: "Navy (Neutral)",        background: NEUTRAL_BULLETIN_NAVY, trim: null },
  };
}

// Colour-independent, so useScopedSetting can validate a saved key without
// having loaded the profile first.
export const BULLETIN_STYLE_IDS = ["primary", "secondary", "primaryTrim", "secondaryTrim", "primaryScallop", "secondaryScallop", "navy"];
export const isBulletinStyleId = k => BULLETIN_STYLE_IDS.includes(k);

// Boards saved a preset id back when those ids named a specific Webster
// colour rather than a role in the profile. An unrecognised key silently
// falls back to the default (see useScopedSetting), so without this every
// board on `orange` or `black` would have jumped to something else the
// moment this shipped. `navy` is deliberately absent -- it kept both its
// id and its colour, so it needs no mapping.
const LEGACY_BULLETIN_IDS = {
  orange: "secondary",
  black: "primary",
  navyTrim: "primaryTrim",
  orangeTrim: "secondaryTrim",
};
export function migrateBulletinStyleId(saved) {
  return LEGACY_BULLETIN_IDS[saved] || saved;
}

// A teacher's own primary, not navy: the point of all of the above is that
// a new board looks like the school that owns it from the first render.
export const DEFAULT_BULLETIN = "primary";
export const BULLETIN_STORAGE_KEY = "bulletinStyle";

// ── Board content components ────────────────────────────────────────────
// Separate axis from arrangement/bulletin above (those are purely
// cosmetic; this changes what's actually on the board). Used to be one
// all-or-nothing "Simple Goals vs. Full Agenda" template choice; replaced
// with five independent on/off toggles — one storage key per component,
// same "cross-tab-synced setting" pattern as Sliding Boards' on/off
// switch — so a teacher can build whatever combination of board content
// their admin's format actually calls for (e.g. just the checklist, or
// checklist + Essential Question with Agenda/Bell Ringer left off) instead of only ever getting the two fixed combinations that
// used to be available. See FullAgendaBoard.jsx for the fields
// themselves.
//
// `default` matches the old "Simple Goals" look (goals checklist only),
// so a teacher who never opens Settings sees exactly what they always
// have — the extra fields are opt-in on a fresh install, not a
// surprise change to every existing board.
export const BOARD_COMPONENTS = {
  learningGoals: { id: "learningGoals", label: "Learning Goals", storageKey: "component:learningGoals", default: "true" },
  essentialQuestion: { id: "essentialQuestion", label: "Essential Question", storageKey: "component:essentialQuestion", default: "false" },
  agenda: { id: "agenda", label: "Agenda", storageKey: "component:agenda", default: "false" },
  bellRinger: { id: "bellRinger", label: "Bell Ringer", storageKey: "component:bellRinger", default: "false" },
};

// ── Board content order ─────────────────────────────────────────────────
// Which of the BOARD_COMPONENTS above renders first, second, etc. in
// the flat (non-sliding) goals column — independent of which ones are ON,
// so a component still has a place in line while toggled off, and turning
// it back on later doesn't silently bump it back to the end. Only the
// flat board content column reads this; Sliding Boards mode keeps its own
// fixed order (Learning Goals, then the four freeform fields in this same
// default sequence) regardless of what a teacher sets here — a smaller
// scope than the flat case, flagged as a follow-up rather than blocking
// this on rebuilding the sliding-boards rendering path too.
export const BOARD_CONTENT_ORDER_STORAGE_KEY = "boardContentOrder";
export const DEFAULT_BOARD_CONTENT_ORDER = ["learningGoals", "essentialQuestion", "agenda", "bellRinger"];

// Saved orders are NORMALISED on the way in rather than rejected: drop
// keys that no longer exist (Home Learning was removed) and append any
// that are missing. The strict check below then passes, so a teacher
// keeps the ordering they chose for everything that survived instead of
// being silently reset to the default because their saved list is now the
// wrong length.
export function normalizeBoardContentOrder(raw) {
  let arr;
  try { arr = JSON.parse(raw); } catch { return DEFAULT_BOARD_CONTENT_ORDER; }
  if (!Array.isArray(arr)) return DEFAULT_BOARD_CONTENT_ORDER;
  const kept = [...new Set(arr.filter(k => DEFAULT_BOARD_CONTENT_ORDER.includes(k)))];
  return [...kept, ...DEFAULT_BOARD_CONTENT_ORDER.filter(k => !kept.includes(k))];
}

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
    isValidBoardContentOrder,
    (v) => JSON.stringify(normalizeBoardContentOrder(v)),
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

// One palette for both wall types. Colour and texture are independent
// properties of a wall -- a cinderblock wall and a drywall wall can be the
// same shade -- so keeping separate lists meant maintaining the same
// neutrals twice and losing your colour whenever you switched type.
export const WALL_COLORS = [
  { id: "tan", label: "Tan (Classic)", base: "#ded6c0" },
  { id: "cream", label: "Cream", base: "#eee3cf" },
  { id: "white", label: "White", base: "#f0ede6" },
  { id: "lightGray", label: "Light Gray", base: "#d9d9d6" },
  { id: "blueGray", label: "Blue-Gray", base: "#c3cdd4" },
  { id: "sage", label: "Sage", base: "#ccd3c4" },
];
export const DEFAULT_WALL_COLOR = "tan";
// Kept so older saved settings still resolve; both now point at the shared
// palette rather than at a per-type one.
export const DEFAULT_WALL_COLOR_BY_TYPE = { cinderblock: "tan", drywall: "white" };

// Mortar lines are derived from the base rather than hand-picked, so a
// custom colour gets sensible ones too -- there is no list to extend when
// a teacher chooses their own shade.
function lighten(hex, amount = 0.10) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map(v => Math.min(255, Math.round(v + (255 - v) * amount)));
  return `#${ch.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function darken(hex, amount = 0.13) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return "#b0aa98";
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map(v => Math.max(0, Math.round(v * (1 - amount))));
  return `#${ch.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

export function isCustomWallColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
}

export const WALL_COLOR_STORAGE_KEY = "wallColor";

// A real concrete block face is nominally 16" x 8" -- 2:1 -- laid in
// running bond with mortar joints about 3/8" wide. This draws that:
// mortar as the tile's fill, block faces as rects sitting on top of it, so
// the joints are actual gaps rather than hairlines drawn over a flat wall.
//
// The tile is one block wide and TWO courses tall, because running bond
// only repeats after two rows. The second course is offset half a block,
// drawn as two rects whose overhang clips at the tile edges and meets up
// again when the tile repeats.
//
// Previously this same 160x160 artwork was squashed into a 160x80
// background tile, which halved every block's height and rendered 4:1
// slivers instead of blocks -- the reason the wall never read as masonry.
const BLOCK_W = 160;          // 16" at 10px/inch
const BLOCK_H = 80;           // 8"
const MORTAR = 5;             // ~3/8"

function cinderblockTileSvg(mortarColor, faceColor, highlightColor) {
  const j = MORTAR / 2;
  const w = BLOCK_W - MORTAR;
  const h = BLOCK_H - MORTAR;
  const face = (x, y) => `
    <rect x='${x + j}' y='${y + j}' width='${w}' height='${h}' rx='1.5' fill='${faceColor}'/>
    <line x1='${x + j + 2}' y1='${y + j + 1}' x2='${x + j + w - 2}' y2='${y + j + 1}' stroke='${highlightColor}' stroke-width='1'/>`;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${BLOCK_W}' height='${BLOCK_H * 2}'>
    <rect width='${BLOCK_W}' height='${BLOCK_H * 2}' fill='${mortarColor}'/>
    ${face(0, 0)}
    ${face(-BLOCK_W / 2, BLOCK_H)}
    ${face(BLOCK_W / 2, BLOCK_H)}
  </svg>`;
}

export function wallColorSwatch(wallTypeKey, wallColorKey) {
  // A custom colour is stored as the hex itself, so anything that is not a
  // preset id and looks like a colour is taken at face value.
  if (isCustomWallColor(wallColorKey)) {
    const base = wallColorKey.trim();
    return { id: base, label: "Custom", base, line: darken(base), highlight: lighten(base) };
  }
  const preset = WALL_COLORS.find(c => c.id === wallColorKey)
    || WALL_COLORS.find(c => c.id === DEFAULT_WALL_COLOR)
    || WALL_COLORS[0];
  return { ...preset, line: darken(preset.base), highlight: lighten(preset.base) };
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
      // Tile drawn and displayed at the same size -- no squashing, so a
      // block stays 2:1 the way a real one is.
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(cinderblockTileSvg(swatch.line, swatch.base, swatch.highlight))}")`,
      backgroundSize: `${BLOCK_W}px ${BLOCK_H * 2}px`,
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
  chalkboardBlack: { id: "chalkboardBlack", label: "Chalkboard (Black)" },
  dryErase: { id: "dryErase", label: "Dry Erase / Whiteboard" },
};
export const DEFAULT_BOARD_SURFACE = "chalkboard";
export const BOARD_SURFACE_STORAGE_KEY = "boardSurface";

// ── Board accent (headers, checkboxes, goal numbers) ──────────────────
// The colour of "LEARNING GOALS" / "BELL RINGER" and everything that
// shares their accent role on the board face -- the 01/02/03 goal
// numbering, hover states.
//
// NOT the checkboxes. Those are chalk (surface.bodyText), like the
// handwriting they sit beside (Jay: "the checkboxes and the check box
// mark in the same color as the normal chalk color ... rather than the
// header color").
//
// This was the literal #E87722 in surfaceColors below, i.e. Webster's
// orange on every teacher's board no matter what they had chosen. It
// follows the profile now, and it is a SETTING rather than only a derived
// value because a teacher may simply not want their accent there (Jay:
// "users may not like certain colors and might want to change them").
//
// Same storage shape as WALL_COLORS: a preset id, or a raw hex for a
// custom colour, told apart by looking at the value. No second key and
// nothing to migrate.
//
// Whatever comes out of here is still run through readableOn() against
// the actual board face before it is used -- a preset, a custom pick, and
// a profile colour are all equally capable of being invisible on a green
// chalkboard, so none of them get to skip the contrast check.
export const BOARD_ACCENT_PRESETS = [
  { id: "accent",  label: "School Accent" },
  { id: "primary", label: "School Primary" },
  { id: "chalk",   label: "Chalk White" },
];
// The bar every board accent has to clear against the board face. 4.5 is
// WCAG AA for normal-size text, and these headers are 12px, so the looser
// large-text 3.0 would not honestly apply to them.
//
// It is worth knowing what this costs: Webster's orange on the green
// chalkboard measures 2.72, so the headers that have always been orange
// there come out lightened to a pale peach. Dropping this to 3.0 would
// leave them at ~#ea8538, near-indistinguishable from the original -- the
// single number to change if that trade is the wrong way round.
export const BOARD_ACCENT_MIN_CONTRAST = 4.5;
export const DEFAULT_BOARD_ACCENT = "accent";
export const BOARD_ACCENT_STORAGE_KEY = "boardAccent";
const CHALK_WHITE = "#f2f2f2";

export function isCustomBoardAccent(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "").trim());
}
export function isBoardAccentKey(value) {
  return isCustomBoardAccent(value) || BOARD_ACCENT_PRESETS.some(p => p.id === value);
}

// What the setting resolves to BEFORE the contrast pass -- the colour the
// teacher actually asked for. surfaceColors() is what makes it legible.
export function boardAccentBaseColor(key, primaryColor, secondaryColor) {
  if (isCustomBoardAccent(key)) return key.trim();
  if (key === "primary") return primaryColor || DEFAULT_PRIMARY_COLOR;
  if (key === "chalk") return CHALK_WHITE;
  return secondaryColor || DEFAULT_SECONDARY_COLOR;
}

export const SLIDING_BOARDS_ENABLED_KEY = "slidingBoardsEnabled";
export const DEFAULT_SLIDING_BOARDS_ENABLED = "false";
export const SLIDING_BOARDS_COUNT_KEY = "slidingBoardsCount";
export const DEFAULT_SLIDING_BOARDS_COUNT = "3";
// "1" is the unified stand-in for "off" (a single flat board, no
// sliding) in the Board Content settings UI (see BoardSettingsPanel
// .jsx) -- there is no separate on/off toggle anymore, just a single
// Number of Boards control; picking 1 board IS off.
export const SLIDING_BOARDS_COUNT_OPTIONS = ["1", "2", "3", "4", "5"];

// Whether a blank-shell teacher has finished (or skipped) the guided
// Build tour (see GuidedTour.jsx) -- a plain "true"/"false" scoped
// setting like every other per-teacher preference, so it is Mongo-
// synced the same way and does not re-prompt a teacher who already
// went through it on a different device or after a cleared cache.
export const BUILD_TOUR_DONE_KEY = "buildTourDone";
export const DEFAULT_BUILD_TOUR_DONE = "false";

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

// Text/background colors for the board surfaces — the two chalkboards are
// light text on a dark face (chalk), dry erase is dark text on a light
// face (marker). Consumed by the goals checklist, FullAgendaBoard, and
// ChalkboardBoardRow so all three read the same surface.
//
// Green and black chalkboards differ ONLY in the face color: same chalk
// text, same wooden ledge, same accent. Keeping them one branch means a
// future change to chalk legibility lands on both instead of drifting.
// `accentColor` is the teacher's chosen board accent (see
// boardAccentBaseColor above), forced to clear WCAG AA against THIS
// surface's own face before it is handed out -- which is the whole reason
// the face colours moved into consts here.
//
// Omitted, the old per-surface literal is used as the input -- but it is
// NOT passed through untouched: it faces the same contrast check as
// anything else. That is deliberate and it is not a no-op. #E87722 on the
// green chalkboard measures 2.72, well under the 4.5 bar, so the headers
// that have always been orange there come out lightened. There is no
// "grandfathered" path; a colour that was never readable does not get to
// stay just because it shipped first.
export function surfaceColors(boardSurfaceKey, accentColor) {
  if (boardSurfaceKey === "dryErase") {
    const face = "#f7f7f4";
    return {
      face,
      ledgeBg: "#d8d8d3",
      ledgeBorder: "#b3b3ac",
      accent: readableOn(accentColor || "#c9622b", face, BOARD_ACCENT_MIN_CONTRAST),
      headerText: "rgba(30,30,30,0.65)",
      bodyText: "rgba(20,20,20,0.85)",
      bodyTextChecked: "rgba(20,20,20,0.32)",
      placeholderText: "rgba(20,20,20,0.4)",
      dividerBorder: "rgba(0,0,0,0.15)",
      textShadow: "none",
      checkboxBorder: "rgba(0,0,0,0.35)",
    };
  }
  // Slate rather than pure #000 -- a true black face makes the chalk text
  // and the board's own shadows read as one flat shape.
  const face = boardSurfaceKey === "chalkboardBlack" ? "#1f2120" : "#2d5a2d";
  return {
    face,
    ledgeBg: "#5c3d0e",
    ledgeBorder: "#3a2408",
    accent: readableOn(accentColor || "#E87722", face, BOARD_ACCENT_MIN_CONTRAST),
    headerText: "rgba(255,255,255,0.6)",
    bodyText: "rgba(255,255,255,0.85)",
    bodyTextChecked: "rgba(255,255,255,0.3)",
    placeholderText: "rgba(255,255,255,0.4)",
    dividerBorder: "rgba(255,255,255,0.15)",
    textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
    checkboxBorder: "rgba(255,255,255,0.4)",
  };
}

// ── Design catalogue & ownership ────────────────────────────────
// Groundwork for the design store (Jay, 2026-08-31): "a store that has a
// ton of different options, then users can add whatever option they want
// to their profile ... we can go nuts making cool designs without
// overwhelming users".
//
// The whole point is that the picker a teacher sees is NOT the full
// catalogue -- it is the subset they have added, plus whatever ships with
// every board. This is the layer that makes that distinction expressible.
// The store's browsing UI is not built; this is what it will write to.
//
// ONE flat owned list keyed "<area>:<optionId>", rather than a list per
// area, so every customisation area is covered by one mechanism and
// adding the seventh area later costs nothing. That is the "for
// customization in multiple areas too" part.
//
// Persisted through useScopedSetting like every other board setting: that
// endpoint stores an arbitrary key to opaque-string map (see
// api/boardSettings.js), so a JSON array needs no schema change and gets
// the cross-tab sync and Mongo mirror for free.
export const DESIGN_AREAS = {
  BULLETIN: "bulletin",
  WALL_TYPE: "wallType",
  WALL_COLOR: "wallColor",
  BOARD_SURFACE: "boardSurface",
  BOARD_LAYOUT: "boardLayout",
  BOARD_ACCENT: "boardAccent",
};

export const designOptionKey = (area, optionId) => `${area}:${optionId}`;

// Options a teacher must ADD before the picker offers them. Anything not
// listed here ships with every board, so this file staying empty means
// today's behaviour is exactly today's behaviour -- nothing has been
// taken away from anyone, and the machinery is simply not gating yet.
//
// Permissive by default on purpose: the failure mode of the other default
// is a teacher silently losing an option they were already using, which
// is much worse than a new design being free for a while. Gate a design
// by adding its id here, in the same commit that adds it to the store.
const STORE_GATED_OPTIONS = {
  // The store's stock. Both bordered styles as well as both scalloped
  // ones, so what ships with every board is the three plain colours and
  // anything decorative is something a teacher chose to add.
  // WHICH designs are gated is a product call, not a technical one --
  // this list is the only place it is expressed.
  [DESIGN_AREAS.BULLETIN]: ["primaryTrim", "secondaryTrim", "primaryScallop", "secondaryScallop"],
  [DESIGN_AREAS.WALL_TYPE]: [],
  [DESIGN_AREAS.WALL_COLOR]: [],
  [DESIGN_AREAS.BOARD_SURFACE]: [],
  [DESIGN_AREAS.BOARD_LAYOUT]: [],
  [DESIGN_AREAS.BOARD_ACCENT]: [],
};

// Ships with every board, no purchase, no ownership record.
export function isDesignOptionIncluded(area, optionId) {
  return !(STORE_GATED_OPTIONS[area] || []).includes(optionId);
}

// Everything the store can show, in one shape, so the store page renders
// from a list rather than hard-coding a section per area -- which is the
// thing that has to stay cheap as areas get added.
//
// `preview` is deliberately area-shaped rather than a single universal
// blob: a bulletin style previews as a strip, a wall colour as a square,
// a layout as two columns. Pretending those are the same thing would cost
// more than the switch it saves.
export const DESIGN_AREA_LABELS = {
  [DESIGN_AREAS.BULLETIN]: "Bulletin Board Styles",
  [DESIGN_AREAS.WALL_TYPE]: "Wall Types",
  [DESIGN_AREAS.WALL_COLOR]: "Wall Colors",
  [DESIGN_AREAS.BOARD_SURFACE]: "Board Surfaces",
  [DESIGN_AREAS.BOARD_LAYOUT]: "Board Layouts",
  [DESIGN_AREAS.BOARD_ACCENT]: "Header & Accent Colors",
};

export function designCatalog(primaryColor, secondaryColor) {
  const bulletins = bulletinStyles(primaryColor, secondaryColor);
  return [
    {
      area: DESIGN_AREAS.BULLETIN,
      label: DESIGN_AREA_LABELS[DESIGN_AREAS.BULLETIN],
      blurb: "The board's top strip — its colour, and the border stapled around the inside.",
      options: Object.values(bulletins).map(b => ({
        id: b.id, label: b.label,
        preview: { kind: "bulletin", background: b.background, trim: b.trim, scallop: b.scallop },
      })),
    },
    {
      area: DESIGN_AREAS.WALL_COLOR,
      label: DESIGN_AREA_LABELS[DESIGN_AREAS.WALL_COLOR],
      blurb: "The classroom wall behind the board.",
      options: WALL_COLORS.map(c => ({ id: c.id, label: c.label, preview: { kind: "swatch", color: c.base } })),
    },
    {
      area: DESIGN_AREAS.WALL_TYPE,
      label: DESIGN_AREA_LABELS[DESIGN_AREAS.WALL_TYPE],
      blurb: "Cinderblock or smooth drywall — texture only; the colour is separate.",
      options: Object.values(WALL_TYPES).map(t => ({ id: t.id, label: t.label, preview: { kind: "wall", wallType: t.id } })),
    },
    {
      area: DESIGN_AREAS.BOARD_SURFACE,
      label: DESIGN_AREA_LABELS[DESIGN_AREAS.BOARD_SURFACE],
      blurb: "What the writing surface itself is made of.",
      options: Object.values(BOARD_SURFACES).map(b => ({
        id: b.id, label: b.label, preview: { kind: "swatch", color: surfaceColors(b.id).face },
      })),
    },
    {
      area: DESIGN_AREAS.BOARD_ACCENT,
      label: DESIGN_AREA_LABELS[DESIGN_AREAS.BOARD_ACCENT],
      blurb: "Section headers and goal numbers. Always contrast-corrected to stay readable on the board.",
      options: BOARD_ACCENT_PRESETS.map(a => ({
        id: a.id, label: a.label,
        preview: { kind: "onBoard", color: boardAccentBaseColor(a.id, primaryColor, secondaryColor) },
      })),
    },
    {
      area: DESIGN_AREAS.BOARD_LAYOUT,
      label: DESIGN_AREA_LABELS[DESIGN_AREAS.BOARD_LAYOUT],
      blurb: "Which side the slides sit on.",
      options: Object.values(BOARD_ARRANGEMENTS).map(a => ({
        id: a.id, label: a.label, preview: { kind: "layout", columns: a.gridTemplateColumns },
      })),
    },
  ];
}

export const OWNED_DESIGN_OPTIONS_KEY = "ownedDesignOptions";
const EMPTY_OWNED = "[]";

export function parseOwnedDesignOptions(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === "string") : [];
  } catch {
    return [];
  }
}
function isOwnedDesignOptionsValue(raw) {
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

// What a teacher has added, and the question every picker should ask
// before offering an option.
//
// IMPORTANT: pickers filter, the BOARD DOES NOT. If a teacher's saved
// selection is something they no longer own, their board must keep
// rendering it rather than silently snapping to a default -- losing the
// look you set up is a far worse outcome than an un-owned option staying
// on screen. So nothing in the render path calls this; only the settings
// panel does.
export function useOwnedDesignOptions() {
  const [raw, setRaw] = useScopedSetting(OWNED_DESIGN_OPTIONS_KEY, EMPTY_OWNED, isOwnedDesignOptionsValue);
  const owned = parseOwnedDesignOptions(raw);
  const write = (list) => setRaw(JSON.stringify([...new Set(list)].sort()));
  return {
    owned,
    has: (area, optionId) => owned.includes(designOptionKey(area, optionId)),
    // Included-with-every-board OR added by this teacher. The one call a
    // picker needs.
    isAvailable: (area, optionId) =>
      isDesignOptionIncluded(area, optionId) || owned.includes(designOptionKey(area, optionId)),
    add: (area, optionId) => write([...owned, designOptionKey(area, optionId)]),
    remove: (area, optionId) => write(owned.filter(k => k !== designOptionKey(area, optionId))),
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
//
// `migrate`, when given, renames a stored value on the way IN -- for a
// setting whose ids have changed meaning since boards started saving them
// (bulletinStyle is the one that needed it). It has to be applied at all
// THREE doors a value comes through, not just localStorage: the `storage`
// event and the Mongo fetch would otherwise hand back a legacy id, fail
// isValid, and silently drop the board to the default.
export function useScopedSetting(storageKeyName, defaultValue, isValid, migrate) {
  const key = scopedKey(storageKeyName);
  const teacherId = getActiveTeacherId();
  // useCallback keyed on `key` alone, exactly as `read` below is: isValid
  // and migrate are inline lambdas at every call site, so listing them
  // would rebuild this every render and re-subscribe the storage listener
  // every render with it.
  const accept = useCallback((raw) => {
    if (typeof raw !== "string") return null;
    const v = migrate ? migrate(raw) : raw;
    return !isValid || isValid(v) ? v : null;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = useCallback(() => {
    if (typeof window === "undefined") return defaultValue;
    return accept(window.localStorage.getItem(key)) ?? defaultValue;
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
      const v = accept(e.newValue);
      if (v !== null) setValue(v);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [key, accept]);

  useEffect(() => {
    let cancelled = false;
    getRemoteBoardSettingsOnce(teacherId)
      .then((remote) => {
        if (cancelled) return;
        const remoteValue = accept(remote ? remote[storageKeyName] : null);
        if (remoteValue !== null) setValue(remoteValue);
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
