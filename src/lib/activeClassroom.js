// Which of the teacher's classrooms this page is showing.
//
// A teacher can run more than one course, each its own board (see
// api/_classroom.js for the server side). The board and Build pages carry
// the classroom in the URL (?class=<id>) the way they carry the teacher;
// Build and Profile remember the last one chosen in localStorage so a
// teacher lands back on the board they were working on. "main" is the
// classroom every teacher starts with and the one all pre-2026-09-02 data
// was moved into, so a page with no ?class= and nothing remembered is the
// board that has always been there.
//
// No imports on purpose: boardConfig.js and every api module read this,
// and a cycle here would be a nuisance to untangle.
export const DEFAULT_CLASSROOM_ID = "main";
const STORAGE_KEY = "homeroom:activeClassroomId";
const CLASSROOM_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

const valid = (v) => (typeof v === "string" && CLASSROOM_RE.test(v) ? v : null);

// A ?class= that names a classroom the profile no longer has -- deleted
// on the Profile page, or a stale link -- means the main classroom, not an
// empty board that looks like the data is gone (Jay, on a Build tab still
// pointed at a classroom he had just deleted: "I think it deleted both?").
// Call once the profile has loaded; it rewrites the URL in place (no
// history entry) and clears the remembered id, and returns true when it
// did, so the caller can reload against the right classroom.
export function dropUnknownClassroom(classrooms) {
  if (typeof window === "undefined" || !Array.isArray(classrooms) || !classrooms.length) return false;
  const current = getActiveClassroomId();
  if (current === DEFAULT_CLASSROOM_ID || classrooms.some(c => c?.id === current)) return false;
  try { window.localStorage.setItem(STORAGE_KEY, DEFAULT_CLASSROOM_ID); } catch { /* ignore */ }
  const url = new URL(window.location.href);
  url.searchParams.delete("class");
  window.location.replace(url.toString());
  return true;
}

export function getActiveClassroomId() {
  if (typeof window === "undefined") return DEFAULT_CLASSROOM_ID;
  try {
    const fromUrl = valid(new URLSearchParams(window.location.search).get("class"));
    // The BOARD is what a link opens, and a link means exactly what it
    // says: ?class= names a classroom, and no ?class= is the default one.
    // It never consults what this browser remembers -- a visitor who
    // followed a Physics link and then a Chemistry one was still shown
    // Physics, because the first visit had been remembered. Build and
    // Profile are the teacher's own pages and do remember.
    const onBoard = window.location.pathname.startsWith("/board");
    if (fromUrl) {
      if (!onBoard) window.localStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    if (onBoard) return DEFAULT_CLASSROOM_ID;
    return valid(window.localStorage.getItem(STORAGE_KEY)) || DEFAULT_CLASSROOM_ID;
  } catch {
    return DEFAULT_CLASSROOM_ID;
  }
}

export function setActiveClassroomId(id) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, valid(id) || DEFAULT_CLASSROOM_ID); } catch { /* ignore */ }
}

// The query-string piece that names a non-default classroom, or nothing.
// Appended to board/Build links so the default classroom keeps the URLs
// it has always had.
export function classroomQuery() {
  const id = getActiveClassroomId();
  return id === DEFAULT_CLASSROOM_ID ? "" : `&class=${encodeURIComponent(id)}`;
}
