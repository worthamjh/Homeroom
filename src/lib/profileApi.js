// Client for /api/profile — the short "who are you" record a signed-in
// teacher fills out once via ProfileOnboarding.jsx, before ever seeing
// their blank board. Same small-fetch-wrapper pattern as
// lib/extraAssignments.js.

import { apiFetch } from "./apiClient";
export async function fetchProfile(teacherId) {
  const params = new URLSearchParams({ teacherId });
  const res = await apiFetch(`/api/profile?${params}`);
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  return res.json(); // null when this teacher hasn't onboarded yet
}

export async function saveProfile({ teacherId, teacherName, school, subject, primaryColor, secondaryColor, headingFont, bodyFont }) {
  const res = await apiFetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherId, teacherName, school, subject, primaryColor, secondaryColor, headingFont, bodyFont }),
  });
  if (!res.ok) throw new Error(`Failed to save profile (${res.status})`);
  return res.json();
}

// Downloads everything Homeroom holds for the signed-in teacher as one
// JSON file (see api/export.js). Kept here rather than in a component so
// the fetch, the filename and the object-URL cleanup live together --
// forgetting the revoke leaks the blob for the life of the tab.
export async function downloadMyData() {
  const res = await apiFetch("/api/export");
  if (!res.ok) {
    throw new Error(res.status === 401
      ? "Sign in first — an export only ever contains your own data."
      : `Couldn't build your export (${res.status}).`);
  }
  const payload = await res.json();
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  );
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `homeroom-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
