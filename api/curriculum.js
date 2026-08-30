// Vercel serverless function: Mongo-backed storage for a blank-shell
// teacher's own units/lessons list (title + lesson titles only — slides,
// goals, assignments, videos each already have their own storage: Mongo
// for uploaded assignments (api/assignments.js), localStorage for a
// lesson's slides-URL override (readLessonSlidesUrl/writeLessonSlidesUrl
// in boardConfig.js)). One document per teacherId, same scoping and
// upsert pattern as api/profile.js and api/assignments.js.
//
// Only ever read/written for blank-shell teachers (see isBlankTeacher in
// WebsterGrovesChemistry.jsx) — the real Webster Groves curriculum stays
// the hardcoded `curriculum` export in that same file and never reaches
// this endpoint. A teacher with no saved document yet gets BLANK_CURRICULUM
// (the one-starter-unit default) from the client instead — this endpoint
// returns `null` in that case, same "200 + null means not onboarded yet"
// convention api/profile.js uses.
//
// Same trust model as the other Mongo endpoints today: this stores
// whatever teacherId the client sends, without independently verifying
// the caller's Clerk session server-side. Real hardening (verify via
// @clerk/backend's verifyToken) is the same flagged future work as
// api/assignments.js and api/profile.js.
import { MongoClient } from "mongodb";

const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "curricula";

// Loose shape validation — not exhaustive, just enough to keep obviously
// malformed data (wrong types, a missing `unit`/`lessons` field) out of
// Mongo, since this is the one collection a teacher can grow arbitrarily
// large through repeated "+ Add Unit"/"+ Add Lesson" clicks.
function sanitizeUnits(units) {
  if (!Array.isArray(units)) return null;
  const clean = units
    .filter(u => u && typeof u.unit === "string" && Array.isArray(u.lessons))
    .map(u => ({
      unit: u.unit,
      hidden: u.hidden === true ? true : undefined,
      lessons: u.lessons
        .filter(l => l && typeof l.title === "string")
        .map(l => ({
          title: l.title,
          // Same as a unit's: `undefined` when not hidden, so the field is
          // simply absent rather than stored as false on every lesson.
          hidden: l.hidden === true ? true : undefined,
          slides: typeof l.slides === "string" ? l.slides : null,
          goals: Array.isArray(l.goals) ? l.goals : [],
          assignments: Array.isArray(l.assignments) ? l.assignments : [],
          videos: Array.isArray(l.videos) ? l.videos : [],
        })),
    }));
  return clean.length ? clean : null;
}

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

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { teacherId } = req.query;
      if (!teacherId) {
        res.status(400).json({ error: "teacherId query param is required" });
        return;
      }
      const col = await getCollection();
      const doc = await col.findOne({ teacherId: String(teacherId) });
      res.status(200).json(doc ? doc.units : null);
      return;
    }

    if (req.method === "POST") {
      const { teacherId, units } = req.body || {};
      const cleanUnits = sanitizeUnits(units);
      if (!teacherId || !cleanUnits) {
        res.status(400).json({ error: "teacherId and a non-empty units array are required" });
        return;
      }
      const col = await getCollection();
      const now = new Date();
      await col.updateOne(
        { teacherId: String(teacherId) },
        { $set: { teacherId: String(teacherId), units: cleanUnits, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      res.status(200).json(cleanUnits);
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/curriculum] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
