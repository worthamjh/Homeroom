// Google Drive Picker integration for AddSlidesCard (see
// WebsterGrovesChemistry.jsx) — lets a teacher browse and pick a real
// Google Slides deck from their own Drive instead of hunting down
// File → Share → Publish to web and pasting the resulting URL by hand.
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

// Cached in memory only (never persisted) — GIS access tokens are
// short-lived (~1hr) and it's fine, even a little expected, to ask again
// after that. Getting a fresh one is still just a silent popup+consent
// check for an already-authorized teacher, not a full re-login.
let cachedToken = null;
function requestAccessToken() {
  return new Promise((resolve, reject) => {
    if (cachedToken) { resolve(cachedToken); return; }
    // This MUST run synchronously inside the caller's click handler (no
    // preceding await) — see the comment on ensureGoogleScriptsLoaded
    // above for why.
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        cachedToken = resp.access_token;
        // Drop the cache a little before GIS's own expiry so a
        // near-the-hour-mark pick doesn't try to use a token that
        // expires mid-request.
        setTimeout(() => { cachedToken = null; }, ((resp.expires_in || 3600) - 60) * 1000);
        resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.type || "Google sign-in was cancelled or failed")),
    });
    tokenClient.requestAccessToken();
  });
}

// Opens the actual Drive file browser, filtered to Slides presentations
// (both native Google Slides and, since Drive can store them too,
// PowerPoint files) so a teacher isn't hunting through every doc/sheet in
// their Drive to find a deck. Two tabs, not one: a flat "Presentations"
// tab (Picker's default recent/search list, scoped to Slides) as the
// tab that's actually showing when the dialog opens, plus a "Browse
// Folders" tab for a deck that isn't recent and needs digging out of a
// unit/lesson subfolder. Giving it only the folders-included view (the
// original version of this function) makes Picker default straight into
// folder-drilling instead of showing anything useful first — confusing
// for a first pick, since "browse every folder in my Drive" isn't
// actually what most teachers want most of the time.
function openPicker(accessToken) {
  return new Promise((resolve) => {
    const recentView = new window.google.picker.DocsView(window.google.picker.ViewId.PRESENTATIONS)
      .setSelectFolderEnabled(false);
    const browseView = new window.google.picker.DocsView(window.google.picker.ViewId.PRESENTATIONS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
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
  const doc = await openPicker(accessToken);
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
