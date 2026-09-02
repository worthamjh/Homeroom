// Client for /api/curriculum — a blank-shell teacher's own saved list of
// units/lessons (see api/curriculum.js for what is and isn't stored
// there). Same small-fetch-wrapper pattern as lib/profileApi.js.

import { apiFetch } from "./apiClient";
import { getActiveClassroomId } from "./activeClassroom";
export async function fetchCurriculum(teacherId) {
  const params = new URLSearchParams({ teacherId, classroomId: getActiveClassroomId() });
  const res = await apiFetch(`/api/curriculum?${params}`);
  if (!res.ok) throw new Error(`Failed to load curriculum (${res.status})`);
  return res.json(); // null when this teacher hasn't added anything yet
}

export async function saveCurriculum(teacherId, units) {
  const res = await apiFetch("/api/curriculum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, classroomId: getActiveClassroomId(), units }),
  });
  if (!res.ok) throw new Error(`Failed to save curriculum (${res.status})`);
  return res.json();
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
