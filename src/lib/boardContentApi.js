// Client for /api/boardContent — a lesson's Full Agenda board content
// (Essential Question, Agenda, Bell Ringer, Home Learning text, and which
// Agenda lines are checked off). Same small-fetch-wrapper pattern as
// lib/curriculumApi.js and lib/profileApi.js.
export async function fetchBoardContent(teacherId, unitIdx, lessonTitle) {
  const params = new URLSearchParams({ teacherId, unitIdx: String(unitIdx), lessonTitle });
  const res = await fetch(`/api/boardContent?${params}`);
  if (!res.ok) throw new Error(`Failed to load board content (${res.status})`);
  return res.json(); // null when nothing's been saved for this lesson yet
}

// `patch` is whichever fields actually changed — one freeform field from
// FullAgendaBoard.jsx's `save`, or just `checkedAgendaLines` from
// `toggleAgendaLine`. The endpoint only $sets whatever arrives, so this
// never needs to send the other fields too.
export async function saveBoardContent(teacherId, unitIdx, lessonTitle, patch) {
  const res = await fetch("/api/boardContent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, unitIdx, lessonTitle, ...patch }),
  });
  if (!res.ok) throw new Error(`Failed to save board content (${res.status})`);
  return res.json();
}

// Mirrors "Reset Board" — removes the saved document entirely so a future
// fetch returns null and the client falls back to its own defaults.
export async function deleteBoardContent(teacherId, unitIdx, lessonTitle) {
  const params = new URLSearchParams({ teacherId, unitIdx: String(unitIdx), lessonTitle });
  const res = await fetch(`/api/boardContent?${params}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to reset board content (${res.status})`);
}
