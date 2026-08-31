// Google Drive Picker integration for AddSlidesCard and AddAssignmentCard
// (see WebsterGrovesChemistry.jsx) — lets a teacher browse and pick a
// real file from their own Drive (a Slides deck, or a PDF/Doc for an
// assignment) instead of hunting down a share link or a local download
// first.
// See .env.example for the two-step Google Cloud Console setup this
// needs (OAuth Client ID + API key) — this file is a no-op with a clear
// error until both are set, same pattern as cloudinary.js.
//
// Deliberately the narrowest possible OAuth scope: `drive.file` only
// grants access to files the teacher explicitly opens through this
// picker (never their whole Drive), which is what keeps this usable in
// Google's OAuth consent screen "Testing" mode without needing Google's
// (slow, multi-week) app-verification review — that review is only
// required for broader/sensitive scopes like drive.readonly.
//
// No new npm dependency — Google Identity Services and the Picker API
// are both loaded as plain <script> tags at runtime (Google's own
// recommended integration path for both), same "fetch straight from the
// vendor, no SDK" spirit as cloudinary.js.

import { isBuiltInPaper, buildBuiltInPaperPdf } from "./paperTemplates";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function googleDriveConfigured() {
  return Boolean(CLIENT_ID && API_KEY);
}

// True when we already hold a live Drive token, i.e. a Drive call can be
// made right now WITHOUT opening Google's consent popup. The distinction
// matters for anything that wants to touch Drive outside a click handler:
// requestAccessToken below has to run synchronously inside a real click
// or the popup gets blocked, so a background/automatic Drive action must
// check this first and quietly skip (leaving the teacher a button to
// press) rather than firing a popup that the browser will swallow.
export function googleDriveSignedIn() {
  return Boolean(readCachedToken());
}

// Both scripts are loaded once and cached on the module (not per-card),
// so re-opening AddSlidesCard on a different lesson doesn't re-fetch or
// re-init anything. Kicked off eagerly on AddSlidesCard mount (see its
// own effect) rather than only on click, so that by the time a teacher
// actually clicks "Browse Google Drive" the OAuth popup below can open
// synchronously within that same click — most browsers only allow
// window.open from a real, uninterrupted user-gesture call stack, and an
// await for a script fetch in between would break that.
let scriptsPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}
export function ensureGoogleScriptsLoaded() {
  if (!googleDriveConfigured()) {
    return Promise.reject(new Error(
      "Google Drive isn't configured — set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_PICKER_API_KEY (see .env.example)."
    ));
  }
  if (!scriptsPromise) {
    scriptsPromise = Promise.all([
      loadScript("https://accounts.google.com/gsi/client"),
      loadScript("https://apis.google.com/js/api.js").then(
        () => new Promise((resolve) => window.gapi.load("picker", resolve))
      ),
    ]).catch(err => {
      // Let a later attempt retry from scratch instead of staying
      // permanently broken because of one transient network blip.
      scriptsPromise = null;
      throw err;
    });
  }
  return scriptsPromise;
}

// Access tokens are cached in localStorage (persists across reloads and
// sessions, scoped to this origin) so the teacher stays signed in to
// Google Drive across page reloads and new tabs. GIS tokens are short-lived
// (~1hr) and we record an explicit expiresAt so we never hand a stale token.
const TOKEN_STORAGE_KEY = "homeroom_google_access_token";
function readCachedToken() {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (!token || Date.now() >= expiresAt) { localStorage.removeItem(TOKEN_STORAGE_KEY); return null; }
    return token;
  } catch { return null; }
}
function writeCachedToken(token, expiresInSec) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({
      token,
      // Expire a minute early so a near-the-hour pick never uses a token
      // that expires mid-request.
      expiresAt: Date.now() + ((expiresInSec || 3600) - 60) * 1000,
    }));
  } catch { /* localStorage unavailable — harmless, just re-prompts next time */ }
}
function clearCachedToken() {
  try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* noop */ }
}

function requestAccessToken() {
  return new Promise((resolve, reject) => {
    const cached = readCachedToken();
    if (cached) { resolve(cached); return; }
    // This MUST run synchronously inside the caller's click handler (no
    // preceding await) — see the comment on ensureGoogleScriptsLoaded
    // above for why.
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        writeCachedToken(resp.access_token, resp.expires_in);
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        const detail = err
          ? (typeof err === "string" ? err : (err.type || err.message || JSON.stringify(err)))
          : "cancelled";
        reject(new Error(`Auth error (${detail})`));
      },
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

// Opens the actual Drive file browser. Two tabs — a flat "recent" tab
// (Picker's default recent/search list) as the default shown on open,
// plus a "Browse Folders" tab that starts at the My Drive root so the
// teacher can click through the same folder hierarchy they see in
// Google Drive itself (Work → Webster Groves → Conceptual Chemistry, etc.)
// rather than a flat grid of every folder across their whole Drive.
//
// `viewId` picks one of Picker's built-in filtered views (e.g.
// ViewId.PRESENTATIONS); `mimeTypes`, when given, narrows a plain
// ViewId.DOCS view to specific MIME types instead (used by the
// assignment picker, which needs "PDF or Google Doc" rather than any one
// built-in category).
// `multiple` turns on Picker's MULTISELECT_ENABLED and makes this resolve
// with an ARRAY. Opt-in rather than always-on: slides and calendar embed
// exactly one thing, so letting a teacher tick three of them would only
// raise a question the caller has no answer to.
// Where the teacher last picked an assignment from. Remembered so the
// picker can offer a way straight back to that folder instead of making
// them walk down from My Drive again -- the one part of the "keep me
// where I was" ask that Picker's API actually allows.
//
// Not teacher-scoped: it is a convenience, not data, and it is only ever
// a folder id this browser has already seen.
const LAST_PICK_FOLDER_KEY = "homeroom_last_assignment_folder";
function readLastPickFolder() {
  try { return window.localStorage.getItem(LAST_PICK_FOLDER_KEY) || null; } catch { return null; }
}
function rememberLastPickFolder(folderId) {
  if (!folderId) return;
  try { window.localStorage.setItem(LAST_PICK_FOLDER_KEY, folderId); } catch { /* ignore */ }
}

function openPicker(accessToken, { viewId, mimeTypes, multiple = false, pinnedFolderId = null } = {}) {
  return new Promise((resolve) => {
    const makeView = () => {
      // No sort option here, and not for want of trying: the Picker API
      // exposes no way to order a view. DocsView's full public surface is
      // setParent / setIncludeFolders / setSelectFolderEnabled / setMode /
      // setOwnedByMe / setStarred / setDocTypesDropDownEnabled /
      // setEnableDrives / setEnableTeamDrives / setFileIds, and
      // PickerBuilder has nothing either. There used to be a
      // setSortCriteria call here guarded by `SortCriteria?.TITLE`, which
      // reads like it works -- google.picker.SortCriteria does not exist,
      // so the guard was always false and the call never ran. Removed
      // rather than left to look like a feature. Google's own default
      // (last modified) is what a teacher gets.
      const view = new window.google.picker.DocsView(viewId || window.google.picker.ViewId.DOCS)
        .setSelectFolderEnabled(false)
        .setMode(window.google.picker.DocsViewMode.LIST);
      if (mimeTypes) view.setMimeTypes(mimeTypes);
      return view;
    };
    const recentView = makeView();
    const browseView = makeView()
      .setIncludeFolders(true)
      .setParent("root")   // start at My Drive root so navigation is hierarchical
      .setLabel("Browse Folders");
    // An EXTRA tab rooted at the last folder used, never a re-rooting of
    // the browser above. Rooting the main view at a subfolder is what
    // trapped a teacher in a folder with no breadcrumb to climb out of
    // (4247933, reverted). As its own tab it can only ever add a shortcut:
    // the full hierarchy is still one click away, and if the folder has
    // since been deleted the worst case is an empty tab beside two working
    // ones.
    const pinnedView = pinnedFolderId
      ? makeView().setIncludeFolders(true).setParent(pinnedFolderId).setLabel("Where you left off")
      : null;
    // setAppId is what makes picking GRANT this app drive.file access to the
    // chosen file. Without it the picker still returns the file's id, and
    // every Drive API call with that id comes back 404 "File not found" --
    // under drive.file scope Google reports a missing grant as not-found
    // rather than forbidden, so it reads like the file does not exist.
    //
    // Nothing noticed until the Bell Ringer template needed files.copy:
    // every earlier picker use only ever built a Kami viewer URL or a Drive
    // thumbnail URL from the id, both of which the TEACHER's own Google
    // session opens. None of them called the Drive API as this app, so none
    // of them needed the grant.
    //
    // The App ID is the Cloud project number, which is the numeric prefix of
    // the OAuth client id -- derived here rather than added as another env
    // var that could drift out of step with the client id it must match.
    const appId = (CLIENT_ID || "").split("-")[0];
    let builder = new window.google.picker.PickerBuilder();
    if (pinnedView) builder = builder.addView(pinnedView);
    builder = builder
      .addView(recentView)
      .addView(browseView)
      .setOAuthToken(accessToken)
      .setAppId(appId)
      .setDeveloperKey(API_KEY)
      .setCallback((data) => {
        if (data.action === window.google.picker.Action.PICKED) {
          // An array for `multiple` callers, the single doc for everyone
          // else -- so this stays a drop-in for the pickers that only ever
          // wanted one.
          resolve(multiple ? (data.docs || []) : data.docs[0]);
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve(multiple ? [] : null);
        }
      });
    if (multiple) builder = builder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
    // Open ON the shortcut when there is one. Guarded because
    // setInitialView is not in Google's published reference even though it
    // is on the builder -- if it ever disappears, the tab is still there to
    // click.
    if (pinnedView && typeof builder.setInitialView === "function") {
      builder = builder.setInitialView(pinnedView);
    }
    const picker = builder.build();
    picker.setVisible(true);
  });
}

// Best-effort: makes the picked file viewable via "anyone with the link."
// Not fatal if it fails — a school Workspace domain can have an admin
// policy blocking external sharing entirely, in which case the teacher
// needs to share it manually and the caller surfaces that as a warning
// rather than losing the picked file.
//
// On its own this is NOT enough to make the iframe embed below actually
// render, though — see publishToWeb, called alongside this.
async function ensurePubliclyViewable(fileId, accessToken) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Couldn't auto-share the file (${res.status}): ${detail}`);
  }
}

// The step that actually matters for the iframe embed to render: Google
// refuses to frame a Slides file's normal view/edit route AT ALL,
// regardless of sharing permissions — "anyone with the link" makes a file
// openable, but not embeddable. The only thing that unlocks the embeddable
// route is the file having gone through "Publish to the web" (File →
// Share → Publish to web in the Slides UI — the same thing this app's own
// paste-a-link flow has always required teachers to do by hand). That
// toggle isn't exposed on the modern Drive v3 API at all; it's only ever
// lived on the older v2 API's `revisions` resource, so this reaches back
// to v2 just for this one call.
async function publishToWeb(fileId, accessToken) {
  const revRes = await fetch(`https://www.googleapis.com/drive/v2/files/${fileId}/revisions?fields=items(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!revRes.ok) {
    const detail = await revRes.text().catch(() => "");
    throw new Error(`Couldn't read the file's revisions (${revRes.status}): ${detail}`);
  }
  const { items } = await revRes.json();
  const latest = items && items[items.length - 1];
  if (!latest) throw new Error("No revision to publish yet — try again in a moment");

  const pubRes = await fetch(`https://www.googleapis.com/drive/v2/files/${fileId}/revisions/${latest.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ published: true, publishAuto: true, publishedOutsideDomain: true }),
  });
  if (!pubRes.ok) {
    const detail = await pubRes.text().catch(() => "");
    throw new Error(`Couldn't publish to the web (${pubRes.status}): ${detail}`);
  }
}

/**
 * The whole flow, start to finish: make sure the scripts are ready, get
 * an access token (may prompt a Google consent popup), open the picker,
 * and — if a file was actually picked, as opposed to cancelled — share it
 * and publish it to the web (both required — see the two functions
 * above), then hand back the same kind of embed URL a pasted "Publish to
 * web" link would have produced (so nothing downstream of AddSlidesCard's
 * onSave needs to know which path a teacher took).
 *
 * @returns {Promise<{ embedUrl: string, name: string, shareWarning: string|null } | null>}
 *   null means the teacher opened the picker and cancelled/closed it —
 *   not an error, just nothing to save.
 */
// The PRESENTATIONS view lists PowerPoint files alongside Google Slides,
// and both paths below used to assume the Slides one. A .pptx got the
// /presentation/d/<id>/embed URL, which only resolves for a NATIVE Slides
// deck, so the board showed a blank frame -- and then publishToWeb failed
// on it (that API only applies to Google-native files) and produced a
// warning telling the teacher to publish it in Google Slides, which they
// cannot do, because it is not a Slides file. Wrong frame, wrong advice.
//
// So the same split as assignments: native Slides keep the Slides embed,
// anything else gets Drive's own file preview, which renders a .pptx in
// an iframe perfectly well. Sharing still has to be opened up either way
// -- that is what makes it visible to a student -- but publish-to-web is
// only attempted where it means something.
const NATIVE_SLIDES_MIME = "application/vnd.google-apps.presentation";

export async function pickGoogleSlidesEmbed() {
  await ensureGoogleScriptsLoaded();
  const accessToken = await requestAccessToken();
  const doc = await openPicker(accessToken, { viewId: window.google.picker.ViewId.PRESENTATIONS });
  if (!doc) return null;

  const isNativeSlides = doc.mimeType === NATIVE_SLIDES_MIME;
  let shareWarning = null;
  try {
    await ensurePubliclyViewable(doc.id, accessToken);
    if (isNativeSlides) await publishToWeb(doc.id, accessToken);
  } catch (err) {
    shareWarning = isNativeSlides
      ? `Picked "${doc.name}", but couldn't automatically publish it to the web (${err.message}). Open it in Google Slides and go File → Share → Publish to web yourself, or the board will show a blank frame instead of the slides.`
      : `Picked "${doc.name}", but couldn't automatically share it (${err.message}). Open it in Drive and set "Anyone with the link" to Viewer, or the board will show a blank frame instead of the slides.`;
  }

  return {
    embedUrl: isNativeSlides
      ? `https://docs.google.com/presentation/d/${doc.id}/embed?start=false&loop=false&delayms=3000`
      : `https://drive.google.com/file/d/${doc.id}/preview`,
    name: doc.name,
    shareWarning,
  };
}

// AddAssignmentCard — Drive picker for PDF / Google Doc assignments.
// Stores the Drive file ID directly rather than downloading and
// re-uploading to Cloudinary: faster for the teacher (no multi-MB
// transfer), no duplicate storage, and the link always reflects whatever
// is currently in their Drive. The Drive thumbnail URL gives Homeroom a
// usable preview image without needing Cloudinary's page-render feature.
// What a teacher is allowed to pick. Word documents are in the list now:
// they were not, so a teacher browsing a folder of .docx saw an EMPTY
// picker with no explanation -- which reads as a bug, not a filter. (The
// filename cleanup below has always stripped .doc/.docx, so the intent
// was there; the mime list never caught up.)
const ASSIGNMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.google-apps.document",                                       // Google Docs
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",    // .docx
  "application/msword",                                                         // .doc
].join(",");

// PDFs open in Kami; everything else opens in Google's own viewer.
//
// Kami is an ANNOTATION tool over a fixed page, which is what a PDF is. A
// Google Doc already reflows and is editable, so marking it up is the
// wrong tool -- and, more to the point, whether Kami renders a Doc at all
// is not something this codebase knows. Sending Docs there would be
// building on an unknown whose failure mode is the bad kind: fine when
// the teacher checks it, broken for a student in class.
//
// The alternative considered and rejected was exporting non-PDFs to PDF
// on add. It would make Kami work everywhere, at the cost of a snapshot
// that goes stale the moment the teacher edits the original, silently.
// cc9db97 already made this call the other way on purpose -- the Drive
// file id is stored precisely so the link always reflects what is in
// their Drive right now.
//
// drive.google.com/open?id= rather than a per-type URL: Drive redirects
// to the right viewer for whatever the file turns out to be, so this does
// not need a table of mime type to URL shape that could go out of date.
function assignmentViewUrl(doc) {
  if (doc.mimeType === "application/pdf") {
    return `https://web.kamihq.com/web/viewer.html?state=${encodeURIComponent(
      JSON.stringify({ id: doc.id, action: "open", from: "google-drive" })
    )}`;
  }
  return `https://drive.google.com/open?id=${doc.id}`;
}

/**
 * Opens the Drive picker scoped to PDFs and Google Docs, then returns
 * just the Drive metadata needed to save each assignment — no download,
 * no Cloudinary upload. The caller stores fileId + viewUrl + thumbUrl
 * directly to MongoDB; cloudinaryPublicId is omitted for Drive picks.
 *
 * MULTI-SELECT. Click as many files as you want, in as many folders as
 * you want, navigating with the picker's own breadcrumb -- then press
 * Select once and every one of them is added.
 *
 * @returns {Promise<Array<{ fileId: string, name: string, viewUrl: string, thumbUrl: string }>>}
 *   An empty array means the teacher cancelled without picking anything
 *   — not an error.
 */
// ONE picker session, with Google's own multi-select doing the work.
//
// This replaced a loop that reopened the picker after every Select, built
// on my assumption that a Picker selection could not survive navigating to
// another folder. I never verified that, and it cost two rounds: the loop
// dumped the teacher back at My Drive root each time, and rooting the
// reopened view at the last file's folder then trapped them in a folder
// with no breadcrumb to climb out of (Jay: "it takes me to this Browser
// Folders tab where i cant navigate to any folders").
//
// What is actually true, checked against the loaded API rather than
// assumed: google.picker.Feature.MULTISELECT_ENABLED exists and resolves,
// so a session genuinely does allow many files. Which means the behaviour
// asked for -- pick a file, stay where you are, climb the breadcrumb, pick
// another, and see what is selected before committing -- is Picker's own
// multi-select, and the loop was working against it.

export async function pickGoogleDriveAssignmentFiles() {
  await ensureGoogleScriptsLoaded();
  const accessToken = await requestAccessToken();
  const batch = await openPicker(accessToken, {
    mimeTypes: ASSIGNMENT_MIME_TYPES,
    multiple: true,
    pinnedFolderId: readLastPickFolder(),
  });
  // Remember where these came from for next time. Last one picked: with a
  // multi-pick they are usually all from one folder, and if not, the most
  // recent is the best guess at where the teacher was working.
  rememberLastPickFolder(batch[batch.length - 1]?.parentId);
  // Deduped anyway: cheap, and nothing downstream wants two identical cards.
  const seenIds = new Set();
  const docs = (batch || []).filter(doc => {
    if (seenIds.has(doc.id)) return false;
    seenIds.add(doc.id);
    return true;
  });
  return docs.map(doc => ({
    fileId: doc.id,
    name: doc.name.replace(/\.(pdf|docx?|gdoc)$/i, ""),
    viewUrl: assignmentViewUrl(doc),
    thumbUrl: `https://drive.google.com/thumbnail?id=${doc.id}&sz=w400`,
  }));
}


// ─── Google Calendar picker ─────────────────────────────────────────────────
//
// Uses calendar.readonly scope to list the teacher's calendars via the
// Calendar API v3, then shows a small DOM-based picker modal so they can
// choose which calendar to embed.
//
// Requires:
//  1. Google Calendar API enabled in Cloud Console (APIs & Services → Library)
//  2. calendar.readonly scope added to OAuth consent screen
//
// The scope IS "restricted" by Google but works fine in Testing mode for
// users added as test users (the developer/teacher is always a test user).

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const CALENDAR_TOKEN_KEY = "homeroom_google_calendar_v3_token";

function readCachedCalendarToken() {
  try {
    const raw = localStorage.getItem(CALENDAR_TOKEN_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (!token || Date.now() >= expiresAt) { localStorage.removeItem(CALENDAR_TOKEN_KEY); return null; }
    return token;
  } catch { return null; }
}
function writeCachedCalendarToken(token, expiresInSec) {
  try {
    localStorage.setItem(CALENDAR_TOKEN_KEY, JSON.stringify({
      token,
      expiresAt: Date.now() + ((expiresInSec || 3600) - 60) * 1000,
    }));
  } catch { /* noop */ }
}

function requestCalendarToken() {
  return new Promise((resolve, reject) => {
    const cached = readCachedCalendarToken();
    if (cached) { resolve(cached); return; }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: CALENDAR_SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        writeCachedCalendarToken(resp.access_token, resp.expires_in);
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        const detail = err
          ? (typeof err === "string" ? err : (err.type || err.message || JSON.stringify(err)))
          : "cancelled";
        reject(new Error(`Auth error (${detail})`));
      },
    });
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function fetchCalendarList(accessToken) {
  // Proxy through our own Vercel API to avoid browser CORS issues inside the iframe
  let res;
  try {
    res = await fetch(`/api/calendarList?accessToken=${encodeURIComponent(accessToken)}`);
  } catch (netErr) {
    localStorage.removeItem("homeroom_google_calendar_v3_token");
    throw new Error(`Network error reaching calendar proxy: ${netErr.message}`);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    localStorage.removeItem("homeroom_google_calendar_v3_token");
    throw new Error(`Couldn't fetch your calendars (${res.status}): ${detail.detail || detail.error || ""}`);
  }
  const data = await res.json();
  return (data.items || []).sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
}

/**
 * Fetches the teacher's Google Calendar list and shows a DOM-based picker
 * modal so they can choose which calendar to embed.
 *
 * Returns { embedUrl, name, shareWarning } or null (cancelled).
 *
 * @returns {Promise<{ embedUrl: string, name: string, shareWarning: null } | null>}
 */
export async function pickGoogleCalendar() {
  await ensureGoogleScriptsLoaded();
  const accessToken = await requestCalendarToken();
  const calendars = await fetchCalendarList(accessToken);

  if (!calendars.length) {
    throw new Error("No calendars found on this Google account.");
  }

  return new Promise((resolve) => {
    // ── overlay ──────────────────────────────────────────────────────────────
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed", inset: "0",
      background: "rgba(0,0,0,0.72)",
      zIndex: "99999",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Lato, sans-serif",
    });

    // ── modal ─────────────────────────────────────────────────────────────────
    const modal = document.createElement("div");
    Object.assign(modal.style, {
      background: "#1e1e1e",
      border: "1px solid #333",
      borderRadius: "10px",
      padding: "24px",
      width: "min(480px, 90vw)",
      maxHeight: "70vh",
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
      boxSizing: "border-box",
    });

    // title
    const title = document.createElement("div");
    title.textContent = "Choose a Google Calendar";
    Object.assign(title.style, {
      fontFamily: "Oswald, sans-serif",
      fontSize: "17px",
      color: "#fff",
      letterSpacing: "0.5px",
    });

    // sub-hint
    const hint = document.createElement("div");
    hint.textContent = "Pick the calendar to embed on the unit overview page.";
    Object.assign(hint.style, {
      fontSize: "12px",
      color: "rgba(255,255,255,0.45)",
      marginTop: "-8px",
    });

    // list
    const list = document.createElement("div");
    Object.assign(list.style, {
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      flexShrink: "1",
    });

    const BASE_BTN = {
      background: "#2a2a2a",
      border: "1px solid #444",
      borderRadius: "6px",
      padding: "10px 14px",
      color: "#fff",
      cursor: "pointer",
      textAlign: "left",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      width: "100%",
      boxSizing: "border-box",
      transition: "border-color 0.12s",
    };

    calendars.forEach(cal => {
      const btn = document.createElement("button");
      Object.assign(btn.style, BASE_BTN);

      if (cal.backgroundColor) {
        const dot = document.createElement("span");
        Object.assign(dot.style, {
          width: "11px", height: "11px",
          borderRadius: "50%",
          background: cal.backgroundColor,
          flexShrink: "0",
          display: "inline-block",
        });
        btn.appendChild(dot);
      }

      const nameSpan = document.createElement("span");
      nameSpan.textContent = cal.summary || cal.id;
      Object.assign(nameSpan.style, { fontSize: "14px", lineHeight: "1.3" });
      btn.appendChild(nameSpan);

      if (cal.primary) {
        const badge = document.createElement("span");
        badge.textContent = "primary";
        Object.assign(badge.style, {
          marginLeft: "auto",
          fontSize: "10px",
          color: "rgba(255,255,255,0.35)",
          fontStyle: "italic",
        });
        btn.appendChild(badge);
      }

      btn.onmouseenter = () => { btn.style.borderColor = "#f90"; btn.style.background = "#333"; };
      btn.onmouseleave = () => { btn.style.borderColor = "#444"; btn.style.background = "#2a2a2a"; };

      btn.onclick = () => {
        document.body.removeChild(overlay);
        resolve({
          embedUrl: `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(cal.id)}&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=0`,
          name: cal.summary || cal.id,
          shareWarning: null, noReload: true,
        });
      };

      list.appendChild(btn);
    });

    // cancel
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    Object.assign(cancelBtn.style, {
      background: "transparent",
      border: "1px solid #555",
      borderRadius: "4px",
      color: "rgba(255,255,255,0.5)",
      padding: "7px 16px",
      cursor: "pointer",
      fontFamily: "Oswald, sans-serif",
      fontSize: "11px",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      alignSelf: "flex-start",
    });
    cancelBtn.onmouseenter = () => { cancelBtn.style.borderColor = "#888"; cancelBtn.style.color = "#fff"; };
    cancelBtn.onmouseleave = () => { cancelBtn.style.borderColor = "#555"; cancelBtn.style.color = "rgba(255,255,255,0.5)"; };
    cancelBtn.onclick = () => { document.body.removeChild(overlay); resolve(null); };

    // click backdrop to cancel
    overlay.onclick = (e) => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(null); } };

    modal.appendChild(title);
    modal.appendChild(hint);
    modal.appendChild(list);
    modal.appendChild(cancelBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

/**
 * Auto-creates a blank Google Doc in the teacher's Drive and returns a
 * Kami viewer URL for it — so a bell ringer document is ready instantly
 * without the teacher having to make one manually.
 *
 * Uses the same OAuth token as the Slides picker (drive.file scope).
 * The created file is accessible to Kami because Kami's web viewer uses
 * the teacher's own Drive session to open it.
 *
 * @param {object} [opts]
 * @param {string} [opts.title]  Display name for the new file (default: "Bell Ringer — <date>")
 * @returns {Promise<{ kamiUrl: string, fileId: string, name: string }>}
 */
// Finds the teacher's "Bell Ringers" folder in Drive, or creates it at
// the My Drive root if it doesn't exist yet. Returns the folder's file ID.
// Uses drive.file scope — creating a folder counts as a "file" the app owns.
async function getOrCreateBellRingerFolder(accessToken) {
  const FOLDER_NAME = "Bell Ringers";
  const FOLDER_MIME = "application/vnd.google-apps.folder";

  // Search for an existing non-trashed folder with that name
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (searchRes.ok) {
    const { files } = await searchRes.json();
    if (files && files.length > 0) return files[0].id;
  }

  // Not found — create it
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    throw new Error(`Couldn't create the Bell Ringers folder (${createRes.status}): ${detail}`);
  }
  const folder = await createRes.json();
  return folder.id;
}

// Drive multipart upload: one request carrying the metadata and the bytes.
// FormData can't be used -- Drive wants multipart/related, and FormData
// always sends multipart/form-data.
async function uploadPdfToDrive(accessToken, { name, parents, blob }) {
  const boundary = `homeroom-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, mimeType: "application/pdf", ...(parents?.length ? { parents } : {}) });
  const body = new Blob([
    `--${boundary}
Content-Type: application/json; charset=UTF-8

${metadata}
`,
    `--${boundary}
Content-Type: application/pdf

`,
    blob,
    `
--${boundary}--
`,
  ]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}). ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export async function createKamiBellRingerDoc({ title, templateId } = {}) {
  await ensureGoogleScriptsLoaded();
  const accessToken = await requestAccessToken();

  const name = title ||
    `Bell Ringer — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // Find or create the "Bell Ringers" folder so all generated docs land
  // in one place rather than scattered across the teacher's Drive root.
  let parents;
  try {
    const folderId = await getOrCreateBellRingerFolder(accessToken);
    parents = [folderId];
  } catch {
    parents = []; // fall back to Drive root if folder step fails
  }

  // With a template set, copy it so the new doc arrives already carrying
  // the teacher's layout; otherwise create a blank one as before. Kami
  // renders the Drive file itself, so whatever is in the copy is what the
  // class sees -- there is no separate PDF to keep in step.
  //
  // A failed copy falls back to a blank doc rather than failing the whole
  // create: the template may have been deleted, or its drive.file grant
  // lost (that grant is per-file and does not survive the file being
  // re-picked elsewhere). Losing the layout is a far smaller problem than
  // a teacher being unable to make a bell ringer at all.
  let file = null;
  let templateError = null;

  // A built-in paper is generated here and uploaded, not copied: the app
  // owns files it creates, so this needs no picker and no per-file grant --
  // it works for a teacher who has set nothing up at all.
  if (isBuiltInPaper(templateId)) {
    try {
      const blob = buildBuiltInPaperPdf(templateId);
      if (!blob) throw new Error(`Unknown built-in paper: ${templateId}`);
      file = await uploadPdfToDrive(accessToken, { name, parents, blob });
    } catch (err) {
      templateError = `Couldn't create that paper: ${err?.message || err}`;
      console.warn("[bellRinger]", templateError);
    }
  }

  if (!file) {
    // Create a blank Google Doc via the Drive v3 REST API.
    // drive.file scope allows creating files — no broader scope needed.
    const res = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.document",
        ...(parents.length ? { parents } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Couldn't create the Bell Ringer doc (${res.status}): ${detail}`);
    }

    file = await res.json();
  }

  // Kami's web viewer opens Drive files via a state parameter containing
  // the Drive file ID — the same pattern the rest of Homeroom already uses
  // for assignment files (see pickGoogleDriveAssignmentFiles above).
  const kamiUrl = `https://web.kamihq.com/web/viewer.html?state=${encodeURIComponent(
    JSON.stringify({ id: file.id, action: "open", from: "google-drive" })
  )}`;

  // templateError is non-null when the copy failed and this fell back to a
  // blank doc. Returned rather than swallowed so the UI can say so: a
  // silent fallback looks exactly like the template not working at all,
  // with nothing on screen to explain why.
  return { kamiUrl, fileId: file.id, name: file.name, templateError };
}
