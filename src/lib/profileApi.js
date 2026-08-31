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
