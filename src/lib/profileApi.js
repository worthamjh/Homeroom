// Client for /api/profile — the short "who are you" record a signed-in
// teacher fills out once via ProfileOnboarding.jsx, before ever seeing
// their blank board. Same small-fetch-wrapper pattern as
// lib/extraAssignments.js.

import { apiFetch } from "./apiClient";
// The last profile this browser saw for a teacher, so a board can paint
// in the right colours on its FIRST frame instead of in Webster Groves
// orange until the fetch lands (Jay, on a new maroon account: "it
// flashed the webster groves color scheme for a second then goes to the
// user color scheme"). Purely a paint hint: the fetch still runs and
// wins. Colours, fonts and names only -- nothing here is secret, and a
// shared board's visitor gets the same public profile anyway.
const PROFILE_CACHE_PREFIX = "homeroom:profile:";
export function readCachedProfile(teacherId) {
  if (typeof window === "undefined" || !teacherId) return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_PREFIX + teacherId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function cacheProfile(teacherId, profile) {
  if (typeof window === "undefined" || !teacherId) return;
  try {
    if (profile) window.localStorage.setItem(PROFILE_CACHE_PREFIX + teacherId, JSON.stringify(profile));
    else window.localStorage.removeItem(PROFILE_CACHE_PREFIX + teacherId);
  } catch { /* ignore */ }
}

export async function fetchProfile(teacherId) {
  const params = new URLSearchParams({ teacherId });
  const res = await apiFetch(`/api/profile?${params}`);
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  const profile = await res.json(); // null when this teacher hasn't onboarded yet
  cacheProfile(teacherId, profile);
  return profile;
}

export async function saveProfile({ teacherId, teacherName, school, subject, primaryColor, secondaryColor, headingFont, bodyFont, homeImageUrl, slug, classrooms }) {
  const res = await apiFetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, teacherName, school, subject, primaryColor, secondaryColor, headingFont, bodyFont, homeImageUrl, slug, classrooms }),
  });
  if (!res.ok) {
    // The server explains a bad or taken board address in words a
    // teacher can act on; pass that through instead of a status code.
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Failed to save profile (${res.status})`);
  }
  const saved = await res.json();
  cacheProfile(teacherId, saved);
  return saved;
}

/** Who owns a short board address (gil-bilt.com/board/<slug>)? null if nobody. */
export async function resolveBoardSlug(slug) {
  const params = new URLSearchParams({ slug });
  const res = await fetch(`/api/profile?${params}`);
  if (!res.ok) throw new Error(`Failed to look up board address (${res.status})`);
  return res.json();   // { teacherId } | null
}

// Downloads everything Homeroom holds for the signed-in teacher as one
// JSON file (see api/export.js). Kept here rather than in a component so
// the fetch, the filename and the object-URL cleanup live together --
// forgetting the revoke leaks the blob for the life of the tab.
export async function downloadMyData() {
  const res = await apiFetch("/api/export");
  if (!res.ok) {
    throw new Error(res.status === 401
      ? "Sign in first — an export only ever contains your own data."
      : `Couldn't build your export (${res.status}).`);
  }
  const payload = await res.json();
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  );
  try {
    const a = document.createElement("a");
    a.href = url;
    // Named for the product, not the old project name. This file is the
    // one artefact of the app a teacher holds in their hand -- and the one
    // they would hand to district IT to show their data is portable -- so
    // it should not arrive called "homeroom".
    a.download = `gil-bilt-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Deletes this teacher's account and everything stored for it.
 *
 * Irreversible, and there is deliberately no undo: the confirm string is
 * required by the server too (see api/deleteAccount.js), so a stray call
 * from anywhere cannot do this by accident.
 */
/**
 * Deletes one classroom and everything stored for it (units, lessons,
 * board settings and content, assignments). The main classroom cannot be
 * deleted this way. Irreversible; the confirm string is required by the
 * server too (see api/deleteClassroom.js).
 */
export async function deleteClassroom(classroomId) {
  const res = await apiFetch("/api/deleteClassroom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classroomId, confirm: "DELETE" }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Couldn't delete that classroom (${res.status}).`);
  }
  return res.json();
}

export async function deleteMyAccount() {
  const res = await apiFetch("/api/deleteAccount", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "DELETE" }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Couldn't delete your account (${res.status}).`);
  }
  return res.json();
}
