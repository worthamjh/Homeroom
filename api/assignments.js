// Vercel serverless function: Mongo-backed storage for teacher-uploaded
// assignments (the "bring your own PDF" flow), kept separate from the
// hardcoded curriculum data in src/WebsterGrovesChemistry.jsx. Each
// assignment is scoped to a unit index + lesson title, same addressing
// the client already uses to look up a lesson's hardcoded assignments.
//
// Real login exists now (Clerk — see src/boardConfig.js's
// useSyncAuthIdentity and main.jsx's <ClerkProvider>), but every document
// here is still scoped under whatever teacherId the CLIENT sends in the
// request, exactly as before — this endpoint does not itself verify who's
// actually signed in. getActiveTeacherId() on the client resolves to a
// signed-in teacher's real Clerk id (prefixed "clerk:") once they're
// signed in, but nothing stops a request from claiming a different
// teacherId outright; the isolation this gives is "different teachers'
// content doesn't collide by default," not "a request is verified to
// belong to the teacher it claims." Hardening this — verifying the
// request's Clerk session token server-side (e.g. via
// @clerk/backend's verifyToken, using CLERK_SECRET_KEY, already reserved
// in .env.example) and deriving teacherId from THAT instead of trusting
// req.body/req.query — is real future work, not done in this pass.
// Defaulting to DEFAULT_TEACHER_ID (Webster Groves' real identity) when
// the client omits teacherId, and the ?teacher=sandbox escape hatch on
// the client, both still work exactly as before.
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
        // Hidden lives on the assignment document itself, so a teacher
        // hiding one hides it everywhere it appears -- the lesson page and
        // the unit overview both read these same docs.
        hidden: false,
        createdAt: new Date(),
      };
      const col = await getCollection();
      const result = await col.insertOne(doc);
      res.status(201).json(toClientShape({ ...doc, _id: result.insertedId }));
      return;
    }

    if (req.method === "PATCH") {
      const { id } = req.query;
      const { label, hidden, teacherId } = req.body || {};
      // Either field may be patched on its own -- rename sends label,
      // the hide/show toggle sends hidden. Build $set from whatever was
      // actually provided so a rename can't blank out hidden, or vice versa.
      const updates = {};
      if (label !== undefined) updates.label = String(label);
      if (hidden !== undefined) updates.hidden = Boolean(hidden);
      if (!id || Object.keys(updates).length === 0) {
        res.status(400).json({ error: "id (query param) and at least one of label or hidden (body) are required" });
        return;
      }
      const { ObjectId } = await import("mongodb");
      const col = await getCollection();
      const result = await col.findOneAndUpdate(
        { _id: new ObjectId(id), teacherId: teacherId ? String(teacherId) : DEFAULT_TEACHER_ID },
        { $set: updates },
        { returnDocument: "after" }
      );
      if (!result) { res.status(404).json({ error: "Assignment not found" }); return; }
      res.status(200).json(toClientShape(result));
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
    // Documents created before the hide/show toggle existed have no
    // `hidden` field at all -- treat those as visible.
    hidden: !!doc.hidden,
  };
}
