// Client for /api/boardSettings — board-formatting preferences (wall,
// board surface, arrangement, bulletin style, sliding boards, Board
// Content on/off + order), synced across devices. Same small-fetch-
// wrapper pattern as lib/curriculumApi.js, lib/profileApi.js, and
// lib/checkedGoalsApi.js.

import { apiFetch } from "./apiClient";
import { getActiveClassroomId } from "./activeClassroom";
// classroomId defaults to the active one; App.jsx's shared-board probe
// passes "main" explicitly to ask about the main board when the URL names
// a classroom that turns out not to exist.
export async function fetchBoardSettings(teacherId, classroomId = getActiveClassroomId()) {
  const params = new URLSearchParams({ teacherId, classroomId });
  const res = await apiFetch(`/api/boardSettings?${params}`);
  if (!res.ok) throw new Error(`Failed to load board settings (${res.status})`);
  return res.json(); // null when nothing's been saved yet
}

export async function saveBoardSetting(teacherId, key, value) {
  const res = await apiFetch("/api/boardSettings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, classroomId: getActiveClassroomId(), key, value }),
  });
  if (!res.ok) throw new Error(`Failed to save board setting (${res.status})`);
  return res.json();
}
