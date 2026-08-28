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

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function googleDriveConfigured() {
  return Boolean(CLIENT_ID && API_KEY);
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

// Access tokens are cached in sessionStorage (tab-scoped, survives
// iframe reloads within the session) so the teacher doesn't have to
// re-pick their Google account every time they add slides and the iframe
// reloads. GIS tokens are short-lived (~1hr) and we record an explicit
// expiresAt so we never hand a stale token to the Picker.
const TOKEN_STORAGE_KEY = "homeroom_google_access_token";
function readCachedToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (!token || Date.now() >= expiresAt) { sessionStorage.removeItem(TOKEN_STORAGE_KEY); return null; }
    return token;
  } catch { return null; }
}
function writeCachedToken(token, expiresInSec) {
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({
      token,
      // Expire a minute early so a near-the-hour pick never uses a token
      // that expires mid-request.
      expiresAt: Date.now() + ((expiresInSec || 3600) - 60) * 1000,
    }));
  } catch { /* sessionStorage unavailable — harmless, just re-prompts next time */ }
}
function clearCachedToken() {
  try { sessionStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* noop */ }
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
      error_callback: (err) => reject(new Error(err?.type || "Google sign-in was cancelled or failed")),
    });
    tokenClient.requestAccessToken();
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
function openPicker(accessToken, { viewId, mimeTypes } = {}) {
  return new Promise((resolve) => {
    const makeView = () => {
      const view = new window.google.picker.DocsView(viewId || window.google.picker.ViewId.DOCS)
        .setSelectFolderEnabled(false);
      if (mimeTypes) view.setMimeTypes(mimeTypes);
      return view;
    };
    const recentView = makeView();
    const browseView = makeView()
      .setIncludeFolders(true)
      .setParent("root")   // start at My Drive root so navigation is hierarchical
      .setLabel("Browse Folders");
    const picker = new window.google.picker.PickerBuilder()
      .addView(recentView)
      .addView(browseView)
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setCallback((data) => {
        if (data.action === window.google.picker.Action.PICKED) {
          resolve(data.docs[0]);
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
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
export async function pickGoogleSlidesEmbed() {
  await ensureGoogleScriptsLoaded();
  const accessToken = await requestAccessToken();
  const doc = await openPicker(accessToken, { viewId: window.google.picker.ViewId.PRESENTATIONS });
  if (!doc) return null;

  let shareWarning = null;
  try {
    await ensurePubliclyViewable(doc.id, accessToken);
    await publishToWeb(doc.id, accessToken);
  } catch (err) {
    shareWarning = `Picked "${doc.name}", but couldn't automatically publish it to the web (${err.message}). Open it in Google Slides and go File → Share → Publish to web yourself, or the board will show a blank frame instead of the slides.`;
  }

  return {
    embedUrl: `https://docs.google.com/presentation/d/${doc.id}/embed?start=false&loop=false&delayms=3000`,
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
// Scoped to PDFs and Google Docs only — the picker narrows what the
// teacher can pick rather than letting them pick something that won't
// display well.
const ASSIGNMENT_MIME_TYPES = "application/pdf,application/vnd.google-apps.document";

/**
 * Opens the Drive picker scoped to PDFs and Google Docs, then returns
 * just the Drive metadata needed to save the assignment — no download,
 * no Cloudinary upload. The caller stores fileId + viewUrl + thumbUrl
 * directly to MongoDB; cloudinaryPublicId is omitted for Drive picks.
 *
 * @returns {Promise<{ fileId: string, name: string, viewUrl: string, thumbUrl: string } | null>}
 *   null means the teacher cancelled the picker — not an error.
 */
export async function pickGoogleDriveAssignmentFile() {
  await ensureGoogleScriptsLoaded();
  const accessToken = await requestAccessToken();
  const doc = await openPicker(accessToken, { mimeTypes: ASSIGNMENT_MIME_TYPES });
  if (!doc) return null;
  return {
    fileId: doc.id,
    name: doc.name.replace(/\.(pdf|docx?|gdoc)$/i, ""),
    viewUrl: `https://web.kamihq.com/web/viewer.html?state=${encodeURIComponent(JSON.stringify({ id: doc.id, action: 'open', from: 'google-drive' }))}`,
    thumbUrl: `https://drive.google.com/thumbnail?id=${doc.id}&sz=w400`,
  };
}
