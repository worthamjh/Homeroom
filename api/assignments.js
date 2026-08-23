// Vercel serverless function: Mongo-backed storage for teacher-uploaded
// assignments (the "bring your own PDF" flow), kept separate from the
// hardcoded curriculum data in src/WebsterGrovesChemistry.jsx. Each
// assignment is scoped to a unit index + lesson title, same addressing
// the client already uses to look up a lesson's hardcoded assignments.
//
// No login system exists yet (see src/boardConfig.js's getActiveTeacherId
// — deliberately not built out further until there's a real reason to,
// e.g. multiple real teachers on one deployment). This mirrors that same
// placeholder identity scheme so swapping in real auth later is a data
// migration, not a rewrite: every document is scoped under whatever
// teacherId the client sends (defaulting to DEFAULT_TEACHER_ID, Webster
// Groves' real identity, if the client omits it for some reason) — this
// is what keeps a teacher experimenting under a different id, e.g.
// ?teacher=sandbox on the client, from ever touching Webster Groves'
// real Mongo-stored assignments, or vice versa.
import { MongoClient } from "mongodb";

const DEFAULT_TEACHER_ID = "local-teacher";
const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "assignments";

// Reuse the Mongo connection across warm serverless invocations instead of
// reconnecting on every request — the standard pattern for Mongo + Vercel
// functions. `global` persists between invocations on a warm lambda.
//
// Deliberately does NOT construct MongoClient at module load time when the
// URI is missing — that would throw during the function's cold start
// (before any request-level error handling runs) instead of surfacing as
// a normal 500 from a specific request. getCollection() below throws a
// clear, catchable error per-request instead.
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
      const { unitIdx, lessonTitle, teacherId } = req.query;
      if (unitIdx == null || !lessonTitle) {
        res.status(400).json({ error: "unitIdx and lessonTitle query params are required" });
        return;
      }
      const col = await getCollection();
      const docs = await col
        .find({ teacherId: teacherId ? String(teacherId) : DEFAULT_TEACHER_ID, unitIdx: Number(unitIdx), lessonTitle: String(lessonTitle) })
        .sort({ createdAt: 1 })
        .toArray();
      res.status(200).json(docs.map(toClientShape));
      return;
    }

    if (req.method === "POST") {
      const { unitIdx, lessonTitle, label, url, thumb, cloudinaryPublicId, teacherId } = req.body || {};
      if (unitIdx == null || !lessonTitle || !label || !url) {
        res.status(400).json({ error: "unitIdx, lessonTitle, label, and url are required" });
        return;
      }
      const doc = {
        teacherId: teacherId ? String(teacherId) : DEFAULT_TEACHER_ID,
        unitIdx: Number(unitIdx),
        lessonTitle: String(lessonTitle),
        label: String(label),
        url: String(url),
        thumb: thumb ? String(thumb) : null,
        cloudinaryPublicId: cloudinaryPublicId ? String(cloudinaryPublicId) : null,
        createdAt: new Date(),
      };
      const col = await getCollection();
      const result = await col.insertOne(doc);
      res.status(201).json(toClientShape({ ...doc, _id: result.insertedId }));
      return;
    }

    if (req.method === "DELETE") {
      const { id, teacherId } = req.query;
      if (!id) {
        res.status(400).json({ error: "id query param is required" });
        return;
      }
      const { ObjectId } = await import("mongodb");
      const col = await getCollection();
      await col.deleteOne({ _id: new ObjectId(id), teacherId: teacherId ? String(teacherId) : DEFAULT_TEACHER_ID });
      res.status(204).end();
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/assignments] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}

function toClientShape(doc) {
  // Same { label, url, thumb } shape AssignmentThumb already expects,
  // plus an id so the UI can support deleting an uploaded assignment later.
  return {
    id: String(doc._id),
    label: doc.label,
    url: doc.url,
    thumb: doc.thumb || undefined,
  };
}
