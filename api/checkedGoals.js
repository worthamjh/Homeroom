// Vercel serverless function: Mongo-backed storage for which learning
// goals a teacher has checked off across their whole board. Before this
// endpoint existed, checked/unchecked state lived ONLY in that browser's
// localStorage (see GOALS_STORAGE_KEY in src/boardConfig.js) — gone the
// moment a teacher opened the board on a different computer or cleared
// their browser data.
//
// One document per teacherId holding the ENTIRE checked-goals map — same
// shape the client already keeps in one React state object, keyed by
// `${panelKey}-${idx}` (see checkedGoals/toggleGoal in
// WebsterGrovesChemistry.jsx). Not scoped per lesson like
// api/boardContent.js: a lesson's own panelKey can be a custom sliding-
// panel label (e.g. Unit 10's "Day 1"/"5th period") rather than its
// lesson title, so splitting this map up by lesson would mean guessing at
// that mapping. Mirroring the client's existing single-blob-per-teacher
// shape exactly avoids that — same trade-off api/curriculum.js already
// makes for a teacher's whole units/lessons list.
//
// Same trust model as every other Mongo endpoint here today: this stores
// whatever teacherId the client sends, without independently verifying
// the caller's Clerk session server-side. Real hardening (verify via
// @clerk/backend's verifyToken) is the same flagged future work as
// api/assignments.js, api/profile.js, api/curriculum.js, and
// api/boardContent.js.
import { MongoClient } from "mongodb";
import { resolveTeacherId } from "./_auth.js";

const DEFAULT_TEACHER_ID = "local-teacher";
const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "checkedGoals";

function getClientPromise() {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local for local dev, or the Vercel project's Environment Variables for deployment — see .env.example."
    );
  }
  if (!global._homeroomMongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    global._homeroomMongoClientPromise = client.connect();
  }
  return global._homeroomMongoClientPromise;
}

async function getCollection() {
  const client = await getClientPromise();
  return client.db(DB_NAME).collection(COLLECTION);
}

// Loose shape validation — just enough to keep obviously malformed data
// (not an object, non-boolean values) out of Mongo. Every value is
// coerced to a real boolean rather than trusted as-is.
function sanitizeCheckedGoals(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const clean = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof key === "string") clean[key] = Boolean(val);
  }
  return clean;
}

export default async function handler(req, res) {
  try {
  // Identity comes from the verified session, never from the request --
  // see api/_auth.js. Any teacherId still arriving in the query or body is
  // ignored, so a caller cannot name a teacher they are not.
  const teacherId = await resolveTeacherId(req, res);
  if (!teacherId) return;   // 401/503 already sent
    if (req.method === "GET") {
      const col = await getCollection();
      const doc = await col.findOne({ teacherId });
      // 200 + null (not 404) when nothing's saved yet — same convention as
      // every other endpoint here. The client keeps whatever it already
      // has (its localStorage cache, or the empty default) in that case.
      res.status(200).json(doc ? doc.checkedGoals : null);
      return;
    }

    if (req.method === "POST") {
      const { checkedGoals } = req.body || {};
      const clean = sanitizeCheckedGoals(checkedGoals);
      if (!clean) {
        res.status(400).json({ error: "a checkedGoals object is required" });
        return;
      }
      const col = await getCollection();
      const now = new Date();
      await col.updateOne(
        { teacherId: teacherId },
        { $set: { teacherId: teacherId, checkedGoals: clean, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      res.status(200).json(clean);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/checkedGoals] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
