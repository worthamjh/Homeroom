// Finds YouTube videos for one lesson. Served as
// /api/curriculum?videos=suggest: the handler below is a complete endpoint
// (its own auth, limits and errors) that api/curriculum.js hands the
// request to, because Vercel's Hobby plan allows twelve serverless
// functions per deployment and api/ already had twelve -- a thirteenth
// file failed the build (2026-09-29). The underscore keeps this a plain
// module in Vercel's eyes, and the local dev plugin (vite.config.js) routes
// by the first path segment, so it lands in the same place there.
//
// WHAT IT DOES. Given a lesson (title, unit, learning goals, essential
// question, and whatever the teacher typed), it asks Claude for two or
// three YouTube searches, runs them through the YouTube Data API, then
// asks Claude to pick the handful that fit the lesson best. That is the
// same method that built the Webster Groves demo's video libraries by
// hand -- titles, channels and descriptions; nobody watched the videos --
// and Jay said those picks were the right kind of videos. Ranking on
// metadata alone is the design, not a shortcut: it is the cheap default
// (Jay, 2026-09-29: "the cheapest option without making the interface
// not user friendly"). Preview frames would triple the model cost and
// actually watching a video would need another provider.
//
// WHAT IT COSTS AND WHERE THE CEILINGS ARE. Two model calls per lesson,
// a few cents. YouTube is free but quota-bound: one search costs 100 of
// a default 10,000 daily units, so about thirty lessons a day for the
// whole site until Google grants a quota extension (a free form; Jay's
// to file). Three things keep both in check:
//   - a per-teacher per-minute bucket (_rateLimit.js) and a per-day cap
//     here, so a stuck loop cannot run up a bill;
//   - search results are cached per query for 30 days, the longest the
//     YouTube API terms allow API data to be kept, and the finished picks
//     per topic -- so the second teacher who builds "lab safety" pays
//     nothing and waits for nothing;
//   - one lesson per request, never a course. The client walks a unit
//     lesson by lesson, which is also its progress bar, and keeps each
//     call well inside a serverless function's time limit.
//
// SWITCHED OFF UNTIL THE KEYS EXIST. Same pattern as the Drive picker:
// with no ANTHROPIC_API_KEY, or no Google key allowed for YouTube Data
// API v3, GET here answers { enabled: false } and Build hides the AI
// controls. Pasting YouTube links into a lesson works regardless.
//
// The teacher's session is required, as on every endpoint that spends
// something on the caller's behalf (see api/calendarList.js).
import Anthropic from "@anthropic-ai/sdk";
import { MongoClient } from "mongodb";
import { createHash } from "node:crypto";
import { resolveTeacherId } from "./_auth.js";
import { classroomIdFrom } from "./_classroom.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { payloadTooBig } from "./_validate.js";

const DB_NAME = process.env.MONGODB_DB || "homeroom";
// Search results and finished picks, told apart by their key prefix.
const CACHE_COLLECTION = "videoSuggestions";
// The per-day counter shares the limiter's collection and its TTL sweep.
const LIMITS_COLLECTION = "rateLimits";
const BOARD_CONTENT_COLLECTION = "boardContent";
// Same sentinel api/boardContent.js and the board use for unit-level text.
const UNIT_CONTENT_LESSON = "__unit__";

// Opus 5.5 since 2026-10-01: same request as Opus 5, a fifth cheaper per
// token. Thinking cannot be switched off on it, which this never did.
const MODEL = "claude-opus-5-5";
const PICK_COUNT = 5;
const SEARCH_RESULTS_PER_QUERY = 10;
const MAX_QUERIES = 3;
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
// Lessons per teacher per day. A whole course is a few dozen; this stops
// the runaway case, not a teacher with a lot of lessons.
const DAILY_LESSON_CAP = 150;
const YOUTUBE_TIMEOUT_MS = 8000;
const MODEL_TIMEOUT_MS = 45000;
// Under a minute is a clip, not a lesson video; over 45 minutes is a full
// period nobody assigns. Claude weighs everything in between.
const MIN_SECONDS = 60;
const MAX_SECONDS = 45 * 60;

// The site's Google key, unless a separate one is named for YouTube. The
// key is referer-restricted to the site's own pages, so a server request
// names the site, as api/profile.js does for Drive.
const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_PICKER_API_KEY || "";
const YOUTUBE_REFERER = "https://gil-bilt.com/";

const modelConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const isConfigured = () => modelConfigured() && !!YOUTUBE_KEY;

// ── Small helpers ──────────────────────────────────────────────────────
const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// Same shapes the board accepts when a teacher pastes a link.
function extractYouTubeId(input) {
  if (!input || typeof input !== "string") return null;
  const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  if (match) return match[1];
  return /^[\w-]{11}$/.test(input.trim()) ? input.trim() : null;
}

// ISO 8601 durations as YouTube writes them: PT8M31S, PT1H2M, PT45S.
function parseDuration(iso) {
  const m = typeof iso === "string" ? iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/) : null;
  if (!m) return 0;
  return (Number(m[1]) || 0) * 86400 + (Number(m[2]) || 0) * 3600 + (Number(m[3]) || 0) * 60 + (Number(m[4]) || 0);
}
const fmtDuration = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtViews = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const normalizeText = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const hash = (s) => createHash("sha1").update(s).digest("hex");

class UpstreamError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ── Mongo ──────────────────────────────────────────────────────────────
function getClientPromise() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set.");
  if (!global._homeroomMongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    // Not a bare connect(): a cached rejection would replay on every later
    // request of this warm lambda. See api/curriculum.js.
    global._homeroomMongoClientPromise = client.connect().catch((err) => {
      global._homeroomMongoClientPromise = undefined;
      throw err;
    });
  }
  return global._homeroomMongoClientPromise;
}
async function getDb() {
  return (await getClientPromise()).db(DB_NAME);
}

// Best-effort once per warm lambda, same as the rate limiter's.
async function ensureCacheTtlIndex(col) {
  if (global._homeroomVideoCacheTtlReady) return;
  global._homeroomVideoCacheTtlReady = true;
  try {
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch {
    global._homeroomVideoCacheTtlReady = false;
  }
}

// The cache never decides anything: a miss (or a broken cache) just means
// the work is done again.
async function cacheGet(key) {
  try {
    const doc = await (await getDb()).collection(CACHE_COLLECTION).findOne({ _id: key });
    if (!doc || (doc.expiresAt && doc.expiresAt < new Date())) return null;
    return doc.value;
  } catch (err) {
    console.error("[api/videoSuggest] cache read failed", err);
    return null;
  }
}
async function cachePut(key, value) {
  try {
    const col = (await getDb()).collection(CACHE_COLLECTION);
    await ensureCacheTtlIndex(col);
    await col.updateOne(
      { _id: key },
      { $set: { value, expiresAt: new Date(Date.now() + CACHE_MS) } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[api/videoSuggest] cache write failed", err);
  }
}

// Fails open like the minute limiter: a broken counter must not take the
// feature down, it just stops protecting for a while.
async function underDailyCap(teacherId) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const col = (await getDb()).collection(LIMITS_COLLECTION);
    const doc = await col.findOneAndUpdate(
      { _id: `${teacherId}:videoSuggestDay:${day}` },
      { $inc: { n: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) } },
      { upsert: true, returnDocument: "after", projection: { n: 1 } }
    );
    const used = doc?.n ?? doc?.value?.n ?? 0;
    return used <= DAILY_LESSON_CAP;
  } catch (err) {
    console.error("[api/videoSuggest] daily counter unavailable, allowing request", err);
    return true;
  }
}

// ── The lesson ─────────────────────────────────────────────────────────
function readLessonInput(body) {
  const goals = Array.isArray(body.goals) ? body.goals.map(g => clip(g, 400)).filter(Boolean).slice(0, 20) : [];
  const exclude = Array.isArray(body.exclude) ? body.exclude.map(v => extractYouTubeId(clip(v, 200))).filter(Boolean).slice(0, 100) : [];
  const rawIdx = body.unitIdx;
  const unitIdx = rawIdx == null || rawIdx === "" || !Number.isInteger(Number(rawIdx)) ? null : Number(rawIdx);
  return {
    unitIdx,
    unitTitle: clip(body.unitTitle, 200),
    lessonTitle: clip(body.lessonTitle, 200),
    essentialQuestion: clip(body.essentialQuestion, 600),
    subject: clip(body.subject, 120),
    request: clip(body.request, 400),
    goals,
    exclude,
  };
}

// A unit-wide build runs from the unit overview, where the client has no
// lesson's typed goals in memory. They live in boardContent (the editable
// Learning Goals field, flat board and each sliding panel), and the
// unit's Essential Question under its sentinel title -- so read them here
// rather than have the client fetch five documents per lesson first.
async function fillFromBoard(lesson, teacherId, classroomId) {
  if (lesson.unitIdx == null) return;
  try {
    const col = (await getDb()).collection(BOARD_CONTENT_COLLECTION);
    const base = { teacherId: String(teacherId), classroomId, unitIdx: lesson.unitIdx };
    if (lesson.goals.length === 0) {
      const docs = await col.find({ ...base, lessonTitle: lesson.lessonTitle }).project({ learningGoals: 1, panelIdx: 1 }).toArray();
      docs.sort((a, b) => (a.panelIdx ?? -1) - (b.panelIdx ?? -1));   // flat board first, then panels in order
      const lines = docs
        .flatMap(d => (typeof d.learningGoals === "string" ? d.learningGoals.split("\n") : []))
        .map(t => t.trim()).filter(Boolean);
      lesson.goals = [...new Set(lines)].slice(0, 20);
    }
    if (!lesson.essentialQuestion) {
      const unitDoc = await col.findOne(
        { ...base, lessonTitle: UNIT_CONTENT_LESSON, panelIdx: { $exists: false } },
        { projection: { essentialQuestion: 1 } }
      );
      if (typeof unitDoc?.essentialQuestion === "string") lesson.essentialQuestion = clip(unitDoc.essentialQuestion, 600);
    }
  } catch (err) {
    console.error("[api/videoSuggest] board content read failed", err);
  }
}

function lessonBlock(lesson) {
  const lines = [];
  if (lesson.subject) lines.push(`Subject: ${lesson.subject}`);
  if (lesson.unitTitle) lines.push(`Unit: ${lesson.unitTitle}`);
  lines.push(`Lesson: ${lesson.lessonTitle}`);
  if (lesson.essentialQuestion) lines.push(`Essential question: ${lesson.essentialQuestion}`);
  lines.push(lesson.goals.length
    ? `Learning goals:\n${lesson.goals.map(g => `- ${g}`).join("\n")}`
    : "Learning goals: none written yet -- go by the lesson and unit titles.");
  if (lesson.request) lines.push(`The teacher's own request: ${lesson.request}`);
  return lines.join("\n");
}

// ── Claude ─────────────────────────────────────────────────────────────
function anthropicClient() {
  if (!global._homeroomAnthropic) {
    global._homeroomAnthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: MODEL_TIMEOUT_MS, maxRetries: 1 });
  }
  return global._homeroomAnthropic;
}

// One JSON answer, shaped by a schema. Thinking stays on (the model's
// default) with the effort set per step: writing searches is easy, so it
// runs low; choosing among candidates is the judgement that matters, so
// it runs higher. Server-side fallbacks are on so a safety decline on
// the main model is answered by another model inside the same call
// rather than by an error. maxTokens is a ceiling, not a spend, and the
// thinking counts toward it, so it is set well above the answer's size.
async function askForJson({ system, user, schema, effort, maxTokens }) {
  const response = await anthropicClient().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new UpstreamError("The video picker declined this request.", 502, "model_refusal");
  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    console.error("[api/videoSuggest] unreadable model answer", response.stop_reason, text.slice(0, 200));
    throw new UpstreamError("The video picker's answer could not be read. Try again.", 502, "model_output");
  }
}

const QUERY_SYSTEM = `You help a K-12 teacher find YouTube videos for one lesson.

Write two or three short YouTube search queries, three to seven words each, that would surface well-known educational videos for this lesson. Make them different angles rather than rewordings: for example a clear explanation of the main concept, an animated overview, and a worked example or demonstration. Take the specific concepts from the learning goals when there are any. Add the subject or level where it keeps results on target (for example "chemistry" or "high school"). Honour the teacher's own request if there is one. No quotation marks, no channel names.`;

const QUERIES_SCHEMA = {
  type: "object",
  properties: { queries: { type: "array", items: { type: "string" } } },
  required: ["queries"],
  additionalProperties: false,
};

async function writeQueries(lesson) {
  const out = await askForJson({ system: QUERY_SYSTEM, user: lessonBlock(lesson), schema: QUERIES_SCHEMA, effort: "low", maxTokens: 6000 });
  const queries = (Array.isArray(out?.queries) ? out.queries : []).map(q => clip(q, 120)).filter(Boolean);
  const unique = [...new Set(queries.map(q => q.toLowerCase()))].slice(0, MAX_QUERIES);
  if (unique.length === 0) unique.push(normalizeText(`${lesson.lessonTitle} ${lesson.subject}`).slice(0, 120));
  return unique;
}

const RANK_SYSTEM = `You are choosing YouTube videos for a teacher to show in class or assign for one lesson. From the candidates, pick the ones that best fit the lesson's learning goals and are the kind of videos experienced teachers actually use: clear explanations from reputable education channels (Crash Course, Khan Academy, Bozeman Science, Amoeba Sisters, TED-Ed, Professor Dave Explains, The Organic Chemistry Tutor, Tyler DeWitt and their peers), animated overviews, worked examples, and lab or demonstration footage.

Prefer three to fifteen minutes. Prefer videos with captions. Prefer a set that works together: one overview, then the specifics the goals name. Avoid full-period lectures, vlogs and reaction videos, exam-cram compilations, videos aimed at a very different age than the level implied, and anything whose title or description shows it is not about this lesson. Pick fewer than asked when fewer fit; never pad with weak matches. Honour the teacher's own request if there is one.

For each pick, the reason is one short sentence for the teacher, at most twenty words, naming what the video covers and why it fits. Use the candidate ids exactly as given.`;

const PICKS_SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, reason: { type: "string" } },
        required: ["id", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
};

async function rankCandidates(lesson, candidates, count) {
  const list = candidates.map((c, i) =>
    `${i + 1}. id=${c.id} | ${c.title} | ${c.channel} | ${fmtDuration(c.durationSec)} | ${fmtViews(c.views)} views | ${c.publishedYear} | captions: ${c.captions ? "yes" : "no"}\n   ${c.description}`
  ).join("\n");
  const user = `${lessonBlock(lesson)}\n\nPick up to ${count} of these candidates.\n\nCandidates:\n${list}`;
  const out = await askForJson({ system: RANK_SYSTEM, user, schema: PICKS_SCHEMA, effort: "medium", maxTokens: 16000 });
  const byId = new Map(candidates.map(c => [c.id, c]));
  const seen = new Set();
  const picks = [];
  for (const p of Array.isArray(out?.picks) ? out.picks : []) {
    const c = byId.get(String(p?.id || "").trim());
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    picks.push({ id: c.id, title: c.title, channel: c.channel, durationSec: c.durationSec, reason: clip(p.reason, 200), fetchedAt: c.fetchedAt });
    if (picks.length >= count) break;
  }
  return picks;
}

// ── YouTube ────────────────────────────────────────────────────────────
async function youtubeGet(path, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", YOUTUBE_KEY);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), YOUTUBE_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(url, { headers: { Referer: YOUTUBE_REFERER }, signal: ctl.signal });
  } catch (err) {
    if (err?.name === "AbortError") throw new UpstreamError("YouTube took too long to answer. Try again in a moment.", 504, "youtube_timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!upstream.ok) {
    // The body is logged, never forwarded: it can echo the key's name and
    // there is nothing in it a teacher can act on. The reason is enough to
    // tell "quota" from "not set up" from "try later".
    const detail = await upstream.text().catch(() => "");
    let reason = "";
    try { reason = JSON.parse(detail)?.error?.errors?.[0]?.reason || ""; } catch { /* not JSON */ }
    console.error("[api/videoSuggest] YouTube error", upstream.status, reason, detail.slice(0, 300));
    if (["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(reason)) {
      throw new UpstreamError("YouTube's daily search allowance for Gil-Bilt is used up. Try again tomorrow.", 429, "youtube_quota");
    }
    if (upstream.status === 400 || upstream.status === 403) {
      throw new UpstreamError("YouTube search is not set up for this site yet.", 503, "youtube_not_configured");
    }
    throw new UpstreamError("YouTube did not answer. Try again in a moment.", 502, "youtube_error");
  }
  return upstream.json();
}

// Ids for one query, from the cache when it has them. An empty result is
// cached too: a dud query should not cost 100 units twice.
async function searchIds(query) {
  const key = `search:${hash(normalizeText(query))}`;
  const cached = await cacheGet(key);
  if (Array.isArray(cached)) return cached;
  const data = await youtubeGet("search", {
    part: "snippet",
    type: "video",
    maxResults: String(SEARCH_RESULTS_PER_QUERY),
    safeSearch: "strict",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    relevanceLanguage: "en",
    q: query,
  });
  const ids = (data.items || []).map(i => i?.id?.videoId).filter(Boolean);
  await cachePut(key, ids);
  return ids;
}

// Everything the ranking step sees, one unit of quota per fifty videos.
// Drops what can never work on the board (not embeddable, not public,
// live) and what no teacher assigns (too short, too long).
async function videoDetails(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const data = await youtubeGet("videos", { part: "snippet,contentDetails,statistics,status", id: ids.slice(i, i + 50).join(","), maxResults: "50" });
    for (const item of data.items || []) {
      const durationSec = parseDuration(item.contentDetails?.duration);
      if (item.status?.embeddable === false || item.status?.privacyStatus !== "public") continue;
      if (durationSec < MIN_SECONDS || durationSec > MAX_SECONDS) continue;
      const live = item.snippet?.liveBroadcastContent && item.snippet.liveBroadcastContent !== "none";
      if (live) continue;
      out.push({
        id: item.id,
        title: clip(item.snippet?.title, 150),
        channel: clip(item.snippet?.channelTitle, 80),
        description: clip(item.snippet?.description, 200).replace(/\s+/g, " "),
        publishedYear: (item.snippet?.publishedAt || "").slice(0, 4),
        durationSec,
        views: Number(item.statistics?.viewCount) || 0,
        captions: item.contentDetails?.caption === "true",
        // When YouTube was last asked; a pick the teacher keeps carries it
        // into the lesson (see "Keeping saved videos current" below).
        fetchedAt: Date.now(),
      });
    }
  }
  return out;
}

// oEmbed needs no key and no quota, and 404s for a video that is gone or
// private -- which is what a teacher pasting a link needs to hear.
async function oembedLookup(id) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), YOUTUBE_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    const d = await r.json();
    return { title: clip(d.title, 150), channel: clip(d.author_name, 80) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── The whole thing for one lesson ─────────────────────────────────────
async function suggestVideos(lesson) {
  const topicKey = `picks:${hash([lesson.subject, lesson.unitTitle, lesson.lessonTitle, lesson.essentialQuestion, ...lesson.goals, lesson.request].map(normalizeText).join("|"))}`;
  // "Find more" (an exclude list) always searches; a first build for a
  // topic somebody has already built is answered from the cache.
  if (lesson.exclude.length === 0) {
    const cached = await cacheGet(topicKey);
    if (Array.isArray(cached?.videos) && cached.videos.length) return { videos: cached.videos, cached: true };
  }
  const queries = await writeQueries(lesson);
  const excluded = new Set(lesson.exclude);
  const ids = [];
  const seen = new Set();
  for (const q of queries) {
    for (const id of await searchIds(q)) {
      if (seen.has(id) || excluded.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  if (ids.length === 0) return { videos: [], queries };
  const candidates = await videoDetails(ids);
  if (candidates.length === 0) return { videos: [], queries };
  const videos = await rankCandidates(lesson, candidates, PICK_COUNT);
  if (lesson.exclude.length === 0 && videos.length) await cachePut(topicKey, { videos, queries });
  return { videos, queries };
}

export default async function handler(req, res) {
  try {
    const teacherId = await resolveTeacherId(req, res);
    if (!teacherId) return;   // 401/503 already sent

    if (req.method === "GET") {
      // ?title=<id or link>: the title and channel for a pasted link, so
      // the tile has a name without the teacher typing one.
      const lookup = typeof req.query?.title === "string" ? req.query.title.trim() : "";
      if (lookup) {
        if (!(await enforceRateLimit(req, res, { teacherId, bucket: "videoTitle" }))) return;
        const id = extractYouTubeId(lookup);
        const meta = id ? await oembedLookup(id) : null;
        if (!meta) {
          res.status(404).json({ error: "That doesn't look like a YouTube video Gil-Bilt can show. Check the link, or the video may be private." });
          return;
        }
        res.status(200).json({ id, ...meta, fetchedAt: Date.now() });
        return;
      }
      if (!(await enforceRateLimit(req, res, { teacherId, bucket: "videoStatus" }))) return;
      res.status(200).json({ enabled: isConfigured() });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    if (!(await enforceRateLimit(req, res, { teacherId, bucket: "videoSuggest" }))) return;
    if (!isConfigured()) {
      res.status(503).json({ error: "AI video search isn't switched on for this site yet.", code: "not_configured" });
      return;
    }
    const body = req.body || {};
    if (payloadTooBig(body, 50_000)) {
      res.status(413).json({ error: "That request is too large." });
      return;
    }
    const lesson = readLessonInput(body);
    if (!lesson.lessonTitle) {
      res.status(400).json({ error: "lessonTitle is required" });
      return;
    }
    if (!(await underDailyCap(teacherId))) {
      res.status(429).json({ error: "You've built a lot of video libraries today. It picks up again tomorrow.", code: "daily_cap" });
      return;
    }
    if (lesson.goals.length === 0 || !lesson.essentialQuestion) {
      await fillFromBoard(lesson, teacherId, classroomIdFrom(req));
    }

    const result = await suggestVideos(lesson);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof UpstreamError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("[api/videoSuggest] Anthropic key rejected");
      res.status(503).json({ error: "AI video search isn't set up correctly on this site yet.", code: "not_configured" });
      return;
    }
    if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "The video picker is busy right now. Try again in a minute.", code: "model_busy" });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[api/videoSuggest] Anthropic error", err.status, err.message);
      res.status(502).json({ error: "The video picker is having trouble right now. Try again in a moment.", code: "model_error" });
      return;
    }
    console.error("[api/videoSuggest] error", err);
    res.status(500).json({ error: "Internal error" });
  }
}

// ── Keeping saved videos current ───────────────────────────────────────
// YouTube's Developer Policies (III.E.4) let a site keep what the API
// returned for thirty days; after that it must be refreshed or deleted.
// The cache above deletes itself. A video kept in a lesson is different:
// its title, channel and length sit in the teacher's curriculum, and in
// the earlier versions kept beside it, for as long as the lesson does. So
// each one carries the time YouTube was last asked about it (`fetchedAt`),
// and this sweep -- served as /api/curriculum?videos=refresh, run once a
// day by the cron entry in vercel.json -- asks again about the ones older
// than REFRESH_AFTER_MS and writes back what YouTube says now. A video
// YouTube no longer returns loses its saved details and is marked
// unavailable: Build shows it so the teacher can remove it, the live
// board leaves it out. If YouTube cannot be asked at all, details that
// reach thirty days are deleted rather than kept.
//
// An entry with neither a stamp nor a channel is a title somebody typed
// (the Webster Groves libraries a script copied in), not API data, and is
// left alone.
//
// No session is needed: nothing here is anyone's to ask for, the work is
// bounded by what is stale, and a second call inside the hour does
// nothing. Set CRON_SECRET in Vercel and only Vercel's own cron call is
// let in.
const DAY_MS = 24 * 60 * 60 * 1000;
// Five days of slack under the limit, so a missed run or a day without
// quota does not turn into a deletion.
const REFRESH_AFTER_MS = 25 * DAY_MS;
const MAX_KEEP_MS = 30 * DAY_MS;
const REFRESH_MIN_GAP_MS = 60 * 60 * 1000;
const REFRESH_COLLECTIONS = ["curricula", "curriculaHistory"];
// Per run. Fifty ids cost one unit of quota, so a full run is thirty.
const REFRESH_MAX_DOCS = 400;
const REFRESH_MAX_IDS = 1500;
const REFRESH_LAST_RUN_ID = "videoRefresh:lastRun";

function isStale(v, now) {
  if (!v || typeof v.id !== "string") return false;
  if (typeof v.fetchedAt === "number") return now - v.fetchedAt >= REFRESH_AFTER_MS;
  // Saved before stamps existed: from YouTube if it has what only YouTube
  // supplies.
  return !!v.channel || v.durationSec != null;
}

// The same test in Mongo's terms, to find the documents worth opening.
const staleFilter = (cutoff) => ({
  "units.lessons.videos": {
    $elemMatch: {
      $or: [
        { fetchedAt: { $lt: cutoff } },
        { fetchedAt: { $exists: false }, channel: { $exists: true } },
        { fetchedAt: { $exists: false }, durationSec: { $exists: true } },
      ],
    },
  },
});

// One run per hour at most, whoever calls. The marker lives beside the
// rate limiter's counters and, having no expiry, is never swept.
async function claimRefreshRun(db, now) {
  const col = db.collection(LIMITS_COLLECTION);
  const claimed = await col.updateOne(
    { _id: REFRESH_LAST_RUN_ID, at: { $lt: new Date(now - REFRESH_MIN_GAP_MS) } },
    { $set: { at: new Date(now) } }
  );
  if (claimed.matchedCount) return true;
  try {
    await col.insertOne({ _id: REFRESH_LAST_RUN_ID, at: new Date(now) });
    return true;
  } catch {
    return false;   // the marker exists and is recent
  }
}

// What YouTube says now. `asked` is every id a successful call covered:
// one of those missing from `found` is a video that is gone or private,
// which is different from one YouTube was never reached about.
async function currentDetails(ids) {
  const found = new Map();
  const asked = new Set();
  if (!YOUTUBE_KEY) return { found, asked };
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    let data;
    try {
      data = await youtubeGet("videos", { part: "snippet,contentDetails,status", id: chunk.join(","), maxResults: "50" });
    } catch (err) {
      console.error("[api/videoRefresh] YouTube could not be asked; the rest waits for the next run", err?.code || err?.message || err);
      break;
    }
    for (const id of chunk) asked.add(id);
    for (const item of data.items || []) {
      if (item.status?.embeddable === false) continue;
      found.set(item.id, {
        title: clip(item.snippet?.title, 150),
        channel: clip(item.snippet?.channelTitle, 80),
        durationSec: parseDuration(item.contentDetails?.duration),
      });
    }
  }
  return { found, asked };
}

// A stale entry as it should be stored now, or the same object when there
// is nothing to change.
function refreshedVideo(v, { found, asked }, now) {
  const id = extractYouTubeId(v.id);
  if (id && asked.has(id)) {
    const fresh = found.get(id);
    if (!fresh) {
      const { title: _title, channel: _channel, durationSec: _durationSec, ...rest } = v;
      return { ...rest, title: "", unavailable: true, fetchedAt: now };
    }
    const next = { ...v, title: fresh.title || v.title || "", fetchedAt: now };
    if (fresh.channel) next.channel = fresh.channel; else delete next.channel;
    if (fresh.durationSec) next.durationSec = fresh.durationSec; else delete next.durationSec;
    delete next.unavailable;
    return next;
  }
  // YouTube was not reached about this one. An entry with no stamp gets
  // one that says "due now", which starts its five days; one that has
  // reached thirty days loses what YouTube supplied.
  if (typeof v.fetchedAt !== "number") return { ...v, fetchedAt: now - REFRESH_AFTER_MS };
  if (now - v.fetchedAt >= MAX_KEEP_MS && (v.title || v.channel || v.durationSec != null)) {
    const { title: _title, channel: _channel, durationSec: _durationSec, ...rest } = v;
    return { ...rest, title: "" };
  }
  return v;
}

// The units with every stale video passed through `apply`, or null when
// nothing changed.
function refreshUnits(units, now, apply) {
  let changed = false;
  const next = units.map(u => !Array.isArray(u?.lessons) ? u : {
    ...u,
    lessons: u.lessons.map(l => {
      if (!Array.isArray(l?.videos) || l.videos.length === 0) return l;
      let touched = false;
      const videos = l.videos.map(v => {
        if (!isStale(v, now)) return v;
        const r = apply(v);
        if (r !== v) touched = true;
        return r;
      });
      if (!touched) return l;
      changed = true;
      return { ...l, videos };
    }),
  });
  return changed ? next : null;
}

export async function videoRefreshHandler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const secret = process.env.CRON_SECRET;
    if (secret && (req.headers?.authorization || "") !== `Bearer ${secret}`) {
      res.status(401).json({ error: "Not allowed." });
      return;
    }
    const now = Date.now();
    const db = await getDb();
    if (!(await claimRefreshRun(db, now))) {
      res.status(200).json({ ran: false, reason: "Already ran within the last hour." });
      return;
    }

    const batches = [];
    const ids = new Set();
    for (const name of REFRESH_COLLECTIONS) {
      const docs = await db.collection(name)
        .find(staleFilter(now - REFRESH_AFTER_MS))
        .project({ units: 1, updatedAt: 1 })
        .limit(REFRESH_MAX_DOCS)
        .toArray();
      for (const doc of docs) {
        for (const u of Array.isArray(doc.units) ? doc.units : []) {
          for (const l of Array.isArray(u?.lessons) ? u.lessons : []) {
            for (const v of Array.isArray(l?.videos) ? l.videos : []) {
              const id = isStale(v, now) ? extractYouTubeId(v.id) : null;
              if (id && ids.size < REFRESH_MAX_IDS) ids.add(id);
            }
          }
        }
      }
      batches.push({ name, docs });
    }

    const details = await currentDetails([...ids]);
    let documents = 0;
    for (const { name, docs } of batches) {
      const col = db.collection(name);
      for (const doc of docs) {
        const units = Array.isArray(doc.units) ? refreshUnits(doc.units, now, v => refreshedVideo(v, details, now)) : null;
        if (!units) continue;
        // A teacher's save that landed since this run read the document
        // wins: the filter misses, and tomorrow's run picks it up.
        const filter = { _id: doc._id };
        if (name === "curricula" && doc.updatedAt) filter.updatedAt = doc.updatedAt;
        const result = await col.updateOne(filter, { $set: { units } });
        if (result.matchedCount) documents += 1;
      }
    }
    res.status(200).json({
      ran: true,
      videos: ids.size,
      asked: details.asked.size,
      current: details.found.size,
      unavailable: [...details.asked].filter(id => !details.found.has(id)).length,
      documents,
    });
  } catch (err) {
    console.error("[api/videoRefresh] error", err);
    res.status(500).json({ error: "Internal error" });
  }
}
