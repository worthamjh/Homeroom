// Client for /api/assignments — teacher-uploaded assignments layered on
// top of the hardcoded per-lesson `assignments` arrays in
// WebsterGrovesChemistry.jsx. Kept as its own small module (same pattern
// as boardConfig.js's helpers) so the component file isn't the place
// fetch/error-handling details live.

import { apiFetch } from "./apiClient";
import { getActiveTeacherId } from "../boardConfig";

export async function fetchExtraAssignments(unitIdx, lessonTitle) {
  const params = new URLSearchParams({
    unitIdx: String(unitIdx),
    lessonTitle,
    teacherId: getActiveTeacherId(),
    classroomId: getActiveClassroomId(),
  });
  const res = await apiFetch(`/api/assignments?${params}`);
  if (!res.ok) throw new Error(`Failed to load assignments (${res.status})`);
  return res.json();
}

export async function createExtraAssignment({ unitIdx, lessonTitle, label, url, thumb, cloudinaryPublicId }) {
  const res = await apiFetch("/api/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      unitIdx, lessonTitle, label, url, thumb, cloudinaryPublicId,
      teacherId: getActiveTeacherId(),
      classroomId: getActiveClassroomId(),
    }),
  });
  if (!res.ok) throw new Error(`Failed to save assignment (${res.status})`);
  return res.json();
}

export async function deleteExtraAssignment(id) {
  const params = new URLSearchParams({ id, teacherId: getActiveTeacherId() });
  const res = await apiFetch(`/api/assignments?${params}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to remove assignment (${res.status})`);
}

// Patch one assignment. Send only the fields you mean to change: a rename
// passes { label }, the hide/show toggle passes { hidden }. Sending an
// undefined field would blank the other one out server-side.
export async function updateExtraAssignment(id, { label, hidden } = {}) {
  const body = { teacherId: getActiveTeacherId() };
  if (label !== undefined) body.label = label;
  if (hidden !== undefined) body.hidden = hidden;
  const res = await apiFetch(`/api/assignments?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to update assignment (${res.status})`);
  return res.json();
}

// Persist a whole new order in one request -- see the PUT branch in
// api/assignments.js. `ids` is every assignment in the list, in the order
// they should appear.
export async function reorderExtraAssignments(ids) {
  const res = await apiFetch("/api/assignments", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, teacherId: getActiveTeacherId() }),
  });
  if (!res.ok) throw new Error(`Failed to reorder assignments (${res.status})`);
  return res.json();
}
