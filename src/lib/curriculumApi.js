// Client for /api/curriculum — a blank-shell teacher's own saved list of
// units/lessons (see api/curriculum.js for what is and isn't stored
// there). Same small-fetch-wrapper pattern as lib/profileApi.js.

import { apiFetch } from "./apiClient";
import { getActiveClassroomId } from "./activeClassroom";
// The last units this browser saw for a teacher's classroom, so a board
// opened by deep link (?unit=&lesson=, a short address, "Back to board")
// lands on its lesson on the FIRST frame instead of showing the home
// screen until the server answers (Jay: "anytime a page is loaded, it
// spazzes, shows the homepage for a second then goes to the page its
// supposed to go to"). Purely a starting point: the fetch still runs and
// wins. Same idea as readCachedProfile in profileApi.js.
const CURRICULUM_CACHE_PREFIX = "homeroom:curriculum:";
const curriculumCacheKey = (teacherId, classroomId = getActiveClassroomId()) => `${CURRICULUM_CACHE_PREFIX}${teacherId}:${classroomId}`;
export function readCachedCurriculum(teacherId) {
  if (typeof window === "undefined" || !teacherId) return null;
  try {
    const raw = window.localStorage.getItem(curriculumCacheKey(teacherId));
    const units = raw ? JSON.parse(raw) : null;
    return Array.isArray(units) && units.length ? units : null;
  } catch {
    return null;
  }
}
function cacheCurriculum(teacherId, units) {
  if (typeof window === "undefined" || !teacherId) return;
  try {
    if (Array.isArray(units) && units.length) window.localStorage.setItem(curriculumCacheKey(teacherId), JSON.stringify(units));
    else window.localStorage.removeItem(curriculumCacheKey(teacherId));
  } catch { /* quota or private mode: the fetch still wins */ }
}

export async function fetchCurriculum(teacherId) {
  const params = new URLSearchParams({ teacherId, classroomId: getActiveClassroomId() });
  const res = await apiFetch(`/api/curriculum?${params}`);
  if (!res.ok) throw new Error(`Failed to load curriculum (${res.status})`);
  const units = await res.json(); // null when this teacher hasn't added anything yet
  cacheCurriculum(teacherId, units);
  return units;
}

export async function saveCurriculum(teacherId, units) {
  const res = await apiFetch("/api/curriculum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, classroomId: getActiveClassroomId(), units }),
  });
  if (!res.ok) throw new Error(`Failed to save curriculum (${res.status})`);
  const saved = await res.json();
  cacheCurriculum(teacherId, Array.isArray(saved?.units) ? saved.units : units);
  return saved;
}

// Previous versions of this teacher's units (see api/curriculumHistory.js).
// The list carries names and counts only; fetchCurriculumVersion pulls the
// units for the one version a teacher actually picks.
export async function fetchCurriculumHistory() {
  const res = await apiFetch(`/api/curriculumHistory?${new URLSearchParams({ classroomId: getActiveClassroomId() })}`);
  if (!res.ok) throw new Error(`Failed to load history (${res.status})`);
  return res.json();
}

export async function fetchCurriculumVersion(id) {
  const params = new URLSearchParams({ id });
  const res = await apiFetch(`/api/curriculumHistory?${params}`);
  if (!res.ok) throw new Error(`Failed to load that version (${res.status})`);
  return res.json();
}
