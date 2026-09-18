// Learning standards: the frameworks a teacher can add in the Design
// Store, the standards in each, and the matcher that suggests which of
// them a lesson's learning goals meet.
//
// Why a store item and not a setting (Jay, 2026-09-18): administrations
// like seeing standards posted with the day's goals, but it is one more
// thing on the screen and one more decision for every teacher. So the
// framework is something a teacher ADDS -- own none and there is no
// standards line anywhere on the board, no toggle, nothing to decide.
//
// Why suggest and never auto-tag: the same goal can feed two standards,
// and whether a day actually earns one depends on how far the class got,
// which no matcher can know from the goal text. The suggestions here
// are lexical -- the goals' words against each standard's statement and
// clarification note -- which is plenty for a catalogue this size, and
// the teacher confirms with one tap. Swapping in a model call later is a
// change to suggestStandards() alone.
//
// The catalogue itself lives in src/lib/standardsData.js, one entry per
// band and strand of the Missouri science standards.
import { MISSOURI_SCIENCE_FRAMEWORKS, MISSOURI_MATH_FRAMEWORKS, MISSOURI_ELA_FRAMEWORKS, MISSOURI_SOCIAL_STUDIES_FRAMEWORKS, MISSOURI_K5_FRAMEWORKS } from "./standardsData.js";

// `short` is what a chip is prefixed with when a teacher owns frameworks
// from more than one family (see StandardsChips): "MLS 9-12.PS1.A.1".
// K-5 first, so the shelf reads kindergarten upward when unfiltered.
export const STANDARDS_FRAMEWORKS = [...MISSOURI_K5_FRAMEWORKS, ...MISSOURI_SCIENCE_FRAMEWORKS, ...MISSOURI_MATH_FRAMEWORKS, ...MISSOURI_ELA_FRAMEWORKS, ...MISSOURI_SOCIAL_STUDIES_FRAMEWORKS];

export const frameworkById = (id) => STANDARDS_FRAMEWORKS.find(f => f.id === id) || null;

// A lesson stores standards as "<frameworkId>:<code>" keys, so two
// frameworks that happen to share a code can never collide.
export const standardKey = (frameworkId, code) => `${frameworkId}:${code}`;

export function lookupStandard(key) {
  if (typeof key !== "string") return null;
  const i = key.indexOf(":");
  if (i < 0) return null;
  const framework = frameworkById(key.slice(0, i));
  const code = key.slice(i + 1);
  const std = framework?.standards.find(s => s.code === code);
  return std ? { key, framework, ...std } : null;
}

// The lesson's `standards` field (api/boardContent.js): a JSON array of
// keys, or "" for none. Anything unparseable reads as none rather than
// breaking the board.
export function parseLessonStandards(raw) {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(k => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function serializeLessonStandards(keys) {
  const unique = [...new Set(keys.filter(k => typeof k === "string"))];
  return unique.length ? JSON.stringify(unique) : "";
}

// ── Matching ────────────────────────────────────────────────────────────
// Words that carry nothing about WHICH standard a goal meets: articles,
// the "I can" / "students will" scaffolding every goal starts with, and
// the framing words the clarification notes all share.
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "as", "is", "are", "be",
  "that", "this", "these", "those", "from", "at", "it", "its", "i", "can", "will", "we", "you", "our",
  "student", "students", "able", "about", "their", "which", "how", "what", "why", "when", "between",
  "into", "such", "could", "include", "examples", "example", "emphasis", "based", "given", "various",
  "one", "two", "some", "than", "other", "each", "using", "use", "used",
]);

// Just enough stemming that "reactions" meets "reaction" and "bonding"
// meets "bonds". Not a real stemmer; a real one is not needed for a
// catalogue of a few dozen entries.
function stem(w) {
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  for (const suffix of ["ations", "ation", "ing", "ed", "es", "s"]) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  return w;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .map(stem);
}

// Unigrams plus adjacent bigrams ("periodic table", "chemical reaction"),
// counted. A bigram match is worth more than its two words apart.
function grams(tokens) {
  const g = new Map();
  tokens.forEach((t, i) => {
    g.set(t, (g.get(t) || 0) + 1);
    if (i < tokens.length - 1) {
      const bg = `${t} ${tokens[i + 1]}`;
      g.set(bg, (g.get(bg) || 0) + 1);
    }
  });
  return g;
}

// Per framework: each standard's gram weights (statement counts fully,
// the note at half) and an inverse-document-frequency table, so a word
// that appears in every standard ("model", "evidence") counts for little
// and one that appears in one or two counts for a lot. Built once.
const indexCache = new Map();
function indexFor(framework) {
  if (indexCache.has(framework.id)) return indexCache.get(framework.id);
  const docs = framework.standards.map(s => {
    const weights = new Map();
    for (const [g, n] of grams(tokenize(s.text))) weights.set(g, (weights.get(g) || 0) + n);
    for (const [g, n] of grams(tokenize(s.note))) weights.set(g, (weights.get(g) || 0) + n * 0.5);
    return { standard: s, weights };
  });
  const df = new Map();
  for (const d of docs) for (const g of d.weights.keys()) df.set(g, (df.get(g) || 0) + 1);
  const N = docs.length;
  const idf = (g) => Math.log((N + 1) / ((df.get(g) || 0) + 1)) + 1;
  const index = { docs, idf };
  indexCache.set(framework.id, index);
  return index;
}

/**
 * The standards a set of learning goals most plausibly meets, best first.
 *
 * `texts` is every goal on the lesson (one string each); they are scored
 * together, since a lesson's standards are one list. Returns at most
 * `limit` entries, each { key, framework, code, text, note, score }, and
 * nothing at all when no standard shares a meaningful word with the
 * goals -- an empty list is the honest answer, not the least-bad guess.
 * Keys in `exclude` (already chosen) are left out.
 */
export function suggestStandards(texts, frameworks, { limit = 3, exclude = [] } = {}) {
  const tokens = tokenize((texts || []).join("\n"));
  if (tokens.length === 0 || !frameworks?.length) return [];
  const goalGrams = grams(tokens);
  const skip = new Set(exclude);
  const scored = [];
  for (const framework of frameworks) {
    const { docs, idf } = indexFor(framework);
    for (const { standard, weights } of docs) {
      const key = standardKey(framework.id, standard.code);
      if (skip.has(key)) continue;
      let score = 0;
      for (const [g, n] of goalGrams) {
        const w = weights.get(g);
        if (!w) continue;
        // A goal that repeats a word is not more about it; cap the goal
        // side at one. Bigrams are the strongest signal there is here.
        score += Math.min(n, 1) * Math.min(w, 2) * idf(g) * (g.includes(" ") ? 2 : 1);
      }
      if (score > 0) scored.push({ key, framework, ...standard, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  // Only suggestions in the same league as the best one. A distant third
  // that shares one common word is noise, not a suggestion.
  const floor = scored[0].score * 0.45;
  return scored.filter(s => s.score >= floor).slice(0, limit);
}

/** Every standard in the given frameworks whose code or text contains `query`, for the browse list. */
export function searchStandards(frameworks, query, limit = 12) {
  const q = String(query || "").trim().toLowerCase();
  const out = [];
  for (const framework of frameworks || []) {
    for (const s of framework.standards) {
      if (!q || s.code.toLowerCase().includes(q) || s.text.toLowerCase().includes(q)) {
        out.push({ key: standardKey(framework.id, s.code), framework, ...s });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
