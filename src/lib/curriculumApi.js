// Client for /api/curriculum — a blank-shell teacher's own saved list of
// units/lessons (see api/curriculum.js for what is and isn't stored
// there). Same small-fetch-wrapper pattern as lib/profileApi.js.
export async function fetchCurriculum(teacherId) {
  const params = new URLSearchParams({ teacherId });
  const res = await fetch(`/api/curriculum?${params}`);
  if (!res.ok) throw new Error(`Failed to load curriculum (${res.status})`);
  return res.json(); // null when this teacher hasn't added anything yet
}

export async function saveCurriculum(teacherId, units) {
  const res = await fetch("/api/curriculum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, units }),
  });
  if (!res.ok) throw new Error(`Failed to save curriculum (${res.status})`);
  return res.json();
}
