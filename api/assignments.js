// Vercel serverless function: Mongo-backed storage for teacher-uploaded
// assignments (the "bring your own PDF" flow), kept separate from the
// hardcoded curriculum data in src/WebsterGrovesChemistry.jsx. Each
// assignment is scoped to a unit index + lesson title, same addressing
// the client already uses to look up a lesson's hardcoded assignments.
//
// Identity comes from the verified Clerk session, never from the request
// — see api/_auth.js for what that means and why. Any teacherId still
// arriving in the query or body is ignored for identity.
import { MongoClient } from "mongodb";
import { resolveTeacherId } from "./_auth.js";
import { classroomIdFrom } from "./_classroom.js";
import { enforceRateLimit } from "./_rateLimit.js";

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
    // Deliberately NOT a bare client.connect(). A REJECTED promise cached
    // here is replayed by every later request on the same warm lambda, so a
    // single failed connection -- a wrong credential, a cluster mid-upgrade
    // -- becomes permanent downtime that outlives the fix and clears only on
    // the next deploy. Found exactly that way: after an Atlas Flex
    // conversion dropped the stored credential, production kept answering
    // "bad auth" long after the password had been restored.
    global._homeroomMongoClientPromise = client.connect().catch((err) => {
      global._homeroomMongoClientPromise = undefined;
      throw err;
    });
  }
  return global._homeroomMongoClientPromise;
}

async function getCollection() {
  const client = await getClientPromise();
  return client.db(DB_NAME).collection(COLLECTION);
}

export default async function handler(req, res) {
  try {
    // Identity comes from the verified session, never from the request --
    // see api/_auth.js. Any teacherId still arriving in the query or body
    // is ignored, so a caller cannot name a teacher they are not.
    const teacherId = await resolveTeacherId(req, res, { allowShared: true });   // a shared board may be read signed-out
    if (!teacherId) return;   // 401/503 already sent
    // Fails open if the limiter itself is unavailable -- see _rateLimit.js.
    if (!(await enforceRateLimit(req, res, { teacherId, bucket: "assignments" }))) return;

    if (req.method === "GET") {
      const { unitIdx, lessonTitle } = req.query;
      if (unitIdx == null || !lessonTitle) {
        res.status(400).json({ error: "unitIdx and lessonTitle query params are required" });
        return;
      }
      const col = await getCollection();
      const docs = await col
        .find({ teacherId, classroomId: classroomIdFrom(req), unitIdx: Number(unitIdx), lessonTitle: String(lessonTitle) })
        // `order` is what drag-to-reorder writes. Documents created before
        // it existed have none; Mongo sorts missing ahead of numbers, so
        // they stay in their original createdAt sequence at the front until
        // a teacher drags something, which stamps an explicit order on all
        // of them at once.
        .sort({ order: 1, createdAt: 1 })
        .toArray();
      res.status(200).json(docs.map(toClientShape));
      return;
    }

    if (req.method === "POST") {
      const { unitIdx, lessonTitle, label, url, thumb, cloudinaryPublicId } = req.body || {};
      if (unitIdx == null || !lessonTitle || !label || !url) {
        res.status(400).json({ error: "unitIdx, lessonTitle, label, and url are required" });
        return;
      }
      const doc = {
        teacherId,
        classroomId: classroomIdFrom(req),
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
        // Timestamp rather than a count: no extra query, and it keeps new
        // assignments landing at the end where a teacher expects them.
        order: Date.now(),
        createdAt: new Date(),
      };
      const col = await getCollection();
      const result = await col.insertOne(doc);
      res.status(201).json(toClientShape({ ...doc, _id: result.insertedId }));
      return;
    }

    if (req.method === "PATCH") {
      const { id } = req.query;
      const { label, hidden } = req.body || {};
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
        { _id: new ObjectId(id), teacherId },
        { $set: updates },
        { returnDocument: "after" }
      );
      if (!result) { res.status(404).json({ error: "Assignment not found" }); return; }
      res.status(200).json(toClientShape(result));
      return;
    }

    // Bulk reorder: one request for the whole list, rather than a PATCH per
    // card. The client sends the ids in their new order and each gets its
    // index stamped as `order`, so a drag is atomic from the UI's point of
    // view and cannot leave a half-applied sequence behind.
    if (req.method === "PUT") {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "ids (non-empty array) is required" });
        return;
      }
      const { ObjectId } = await import("mongodb");
      const col = await getCollection();
      await col.bulkWrite(ids.map((id, index) => ({
        updateOne: {
          // teacherId in the filter so a stray id from another teacher's
          // board cannot be reordered through this endpoint.
          filter: { _id: new ObjectId(String(id)), teacherId: teacherId },
          update: { $set: { order: index } },
        },
      })));
      res.status(200).json({ ok: true, count: ids.length });
      return;
    }

    if (req.method === "DELETE") {
      const { id } = req.query;
      if (!id) {
        res.status(400).json({ error: "id query param is required" });
        return;
      }
      const { ObjectId } = await import("mongodb");
      const col = await getCollection();
      // teacherId in the filter, from the session: deleting by _id alone
      // would let anyone with an assignment id remove another teacher's.
      await col.deleteOne({ _id: new ObjectId(id), teacherId });
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
    order: typeof doc.order === "number" ? doc.order : null,
  };
}
