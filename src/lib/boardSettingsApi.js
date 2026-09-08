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

// `keepalive` lets a save started as the page is closing finish anyway;
// a setting is at most 20KB (api/_validate.js), well inside the 64KB
// that keepalive requests are allowed.
export async function saveBoardSetting(teacherId, key, value, { keepalive = false } = {}) {
  const res = await apiFetch("/api/boardSettings", {
    method: "POST",
    keepalive,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, classroomId: getActiveClassroomId(), key, value }),
  });
  if (!res.ok) throw new Error(`Failed to save board setting (${res.status})`);
  return res.json();
}
