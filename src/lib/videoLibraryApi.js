// Client for /api/videoSuggest -- the AI half of a lesson's video library.
// See that file for what it does, what it costs, and why it ranks videos
// on their titles, channels and descriptions rather than watching them.
//
// Same small-fetch-wrapper shape as lib/curriculumApi.js. Errors carry the
// server's own sentence (`error.message`), its HTTP status and, when the
// server gave one, a `code` -- "not_configured" is the one Build reads,
// to hide the AI controls instead of offering a button that cannot work.
import { apiFetch } from "./apiClient";
import { getActiveClassroomId } from "./activeClassroom";

async function errorFrom(res, fallback) {
  let message = fallback;
  let code;
  try {
    const data = await res.json();
    if (typeof data?.error === "string" && data.error) message = data.error;
    code = data?.code;
  } catch { /* no body */ }
  const err = new Error(message);
  err.status = res.status;
  err.code = code;
  return err;
}

// { enabled } -- false until the site has both keys (see .env.example).
export async function fetchVideoSuggestStatus() {
  const res = await apiFetch("/api/videoSuggest");
  if (!res.ok) throw await errorFrom(res, `Could not check video search (${res.status})`);
  return res.json();
}

// { id, title, channel } for a pasted link or id, from YouTube's oEmbed
// (no key, no quota). Throws with the server's sentence when the video
// cannot be shown.
export async function lookupVideoTitle(idOrUrl) {
  const params = new URLSearchParams({ title: idOrUrl });
  const res = await apiFetch(`/api/videoSuggest?${params}`);
  if (!res.ok) throw await errorFrom(res, "That video could not be found.");
  return res.json();
}

// The picks for one lesson: [{ id, title, channel, durationSec, reason }].
// `goals` and `essentialQuestion` are what the client has in memory; sent
// empty (a unit-wide build from the overview page), the server reads
// them from the lesson's board content itself. `exclude` lists the ids
// already on the lesson, which turns a build into "find more".
export async function suggestLessonVideos({ unitIdx, unitTitle, lessonTitle, goals = [], essentialQuestion = "", subject = "", request = "", exclude = [] }) {
  const res = await apiFetch("/api/videoSuggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classroomId: getActiveClassroomId(), unitIdx, unitTitle, lessonTitle, goals, essentialQuestion, subject, request, exclude }),
  });
  if (!res.ok) throw await errorFrom(res, "Video search didn't answer. Try again in a moment.");
  const data = await res.json();
  return Array.isArray(data?.videos) ? data.videos : [];
}
