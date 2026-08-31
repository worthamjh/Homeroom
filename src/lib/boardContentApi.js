// Client for /api/boardContent — a lesson's Full Agenda board content
// (Essential Question, Agenda, Bell Ringer text, and which
// Agenda lines are checked off). Same small-fetch-wrapper pattern as
// lib/curriculumApi.js and lib/profileApi.js.
//
// `panelIdx` is optional — only sliding-board panels pass it. The flat board
// and unit board omit it so their documents stay at the same key they always
// had (backward compatible with existing saved data).

import { apiFetch } from "./apiClient";
export async function fetchBoardContent(teacherId, unitIdx, lessonTitle, panelIdx) {
  const params = new URLSearchParams({ teacherId, unitIdx: String(unitIdx), lessonTitle });
  if (panelIdx != null) params.set("panelIdx", String(panelIdx));
  const res = await apiFetch(`/api/boardContent?${params}`);
  if (!res.ok) throw new Error(`Failed to load board content (${res.status})`);
  return res.json(); // null when nothing's been saved for this lesson yet
}

// `patch` is whichever fields actually changed — one freeform field from
// FullAgendaBoard.jsx's `save`, or just `checkedAgendaLines` from
// `toggleAgendaLine`. The endpoint only $sets whatever arrives, so this
// never needs to send the other fields too.
export async function saveBoardContent(teacherId, unitIdx, lessonTitle, patch, panelIdx) {
  const body = { teacherId, unitIdx, lessonTitle, ...patch };
  if (panelIdx != null) body.panelIdx = panelIdx;
  const res = await apiFetch("/api/boardContent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to save board content (${res.status})`);
  return res.json();
}

// Mirrors "Reset Board" — removes the saved document entirely so a future
// fetch returns null and the client falls back to its own defaults.
export async function deleteBoardContent(teacherId, unitIdx, lessonTitle, panelIdx) {
  const params = new URLSearchParams({ teacherId, unitIdx: String(unitIdx), lessonTitle });
  if (panelIdx != null) params.set("panelIdx", String(panelIdx));
  const res = await apiFetch(`/api/boardContent?${params}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(`Failed to reset board content (${res.status})`);
}
