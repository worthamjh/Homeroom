// Client for /api/boardSettings — board-formatting preferences (wall,
// board surface, arrangement, bulletin style, sliding boards, Board
// Content on/off + order), synced across devices. Same small-fetch-
// wrapper pattern as lib/curriculumApi.js, lib/profileApi.js, and
// lib/checkedGoalsApi.js.
export async function fetchBoardSettings(teacherId) {
  const params = new URLSearchParams({ teacherId });
  const res = await fetch(`/api/boardSettings?${params}`);
  if (!res.ok) throw new Error(`Failed to load board settings (${res.status})`);
  return res.json(); // null when nothing's been saved yet
}

export async function saveBoardSetting(teacherId, key, value) {
  const res = await fetch("/api/boardSettings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, key, value }),
  });
  if (!res.ok) throw new Error(`Failed to save board setting (${res.status})`);
  return res.json();
}
