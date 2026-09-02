// Client for /api/checkedGoals — the whole "which learning goals has this
// teacher checked off" map, synced across devices. Same small-fetch-
// wrapper pattern as lib/curriculumApi.js and lib/profileApi.js.

import { apiFetch } from "./apiClient";
import { getActiveClassroomId } from "./activeClassroom";
export async function fetchCheckedGoals(teacherId) {
  const params = new URLSearchParams({ teacherId, classroomId: getActiveClassroomId() });
  const res = await apiFetch(`/api/checkedGoals?${params}`);
  if (!res.ok) throw new Error(`Failed to load checked goals (${res.status})`);
  return res.json(); // null when nothing's been saved yet
}

export async function saveCheckedGoals(teacherId, checkedGoals) {
  const res = await apiFetch("/api/checkedGoals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, classroomId: getActiveClassroomId(), checkedGoals }),
  });
  if (!res.ok) throw new Error(`Failed to save checked goals (${res.status})`);
  return res.json();
}
