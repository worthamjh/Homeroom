// Vercel serverless function: Mongo-backed storage for a teacher's profile
// (name, school, subject/room) — the short form a brand-new signed-in
// teacher fills out once, before landing on their blank board (see
// src/LandingPage.jsx / src/ProfileOnboarding.jsx). One document per
// teacherId, same scoping scheme as api/assignments.js (a signed-in
// teacher's id is "clerk:<clerk user id>"; DEFAULT_TEACHER_ID/sandbox ids
// never reach here since Landing only shows the onboarding form when
// actually signed in via Clerk).
//
// Same trust model as api/assignments.js today: this endpoint stores
// whatever teacherId the client sends, it does not itself verify the
// caller's Clerk session server-side. Real hardening (verify via
// @clerk/backend's verifyToken, using CLERK_SECRET_KEY) is the same
// future work flagged there, not done in this pass.
import { MongoClient } from "mongodb";

const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "profiles";

// Same warm-lambda connection reuse as api/assignments.js — see the
// comments there for why this is structured as a lazy getter rather than
// connecting at module load time.
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
      // 200 + null (not 404) when no profile exists yet — the client's
      // "does this teacher need onboarding" check just tests for a falsy
      // body, no need to special-case a 404 response.
      res.status(200).json(doc ? toClientShape(doc) : null);
      return;
    }

    if (req.method === "POST") {
      const { teacherId, teacherName, school, subject } = req.body || {};
      if (!teacherId || !teacherName) {
        res.status(400).json({ error: "teacherId and teacherName are required" });
        return;
      }
      const col = await getCollection();
      const now = new Date();
      const update = {
        teacherId: String(teacherId),
        teacherName: String(teacherName),
        school: school ? String(school) : null,
        subject: subject ? String(subject) : null,
        updatedAt: now,
      };
      // Upsert keyed on teacherId — a teacher only ever has one profile
      // document, and re-saving from the onboarding form (or a future
      // "edit profile" surface) should update it in place rather than
      // create a duplicate. $setOnInsert keeps createdAt stable across
      // edits instead of resetting it every save.
      await col.updateOne(
        { teacherId: update.teacherId },
        { $set: update, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      const saved = await col.findOne({ teacherId: update.teacherId });
      res.status(200).json(toClientShape(saved));
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/profile] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}

function toClientShape(doc) {
  return {
    teacherId: doc.teacherId,
    teacherName: doc.teacherName,
    school: doc.school || "",
    subject: doc.subject || "",
  };
}
