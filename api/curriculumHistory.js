// Read-only access to the previous versions of a teacher's units that
// api/curriculum.js has been quietly keeping.
//
// Those snapshots have existed for a while with nothing able to reach
// them: up to 30 versions per teacher, written on every save, and no way
// for the teacher whose work it is to see or recover one. A backup
// nobody can restore from is not a backup.
//
// This endpoint only READS. Restoring is deliberately not a route here:
// the client restores by POSTing the chosen units to /api/curriculum
// like any other save, which means the restore itself gets snapshotted
// first and can be undone the same way. One write path, not two -- a
// second one would have to re-implement the sanitising, the size cap and
// the history capture, and would drift.
import { MongoClient, ObjectId } from "mongodb";
import { resolveTeacherId, PUBLIC_TEACHER_ID } from "./_auth.js";

const DB_NAME = process.env.MONGODB_DB || "homeroom";
const HISTORY_COLLECTION = "curriculaHistory";

// The list is metadata plus unit names only. Thirty full curricula in one
// response would be megabytes for a teacher who has been busy, and the
// picker only needs enough to tell versions apart; the units themselves
// are fetched one version at a time.
const NAMES_IN_SUMMARY = 12;

function getClientPromise() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set.");
  }
  if (!global._homeroomMongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    global._homeroomMongoClientPromise = client.connect().catch((err) => {
      global._homeroomMongoClientPromise = undefined;
      throw err;
    });
  }
  return global._homeroomMongoClientPromise;
}

export default async function handler(req, res) {
  try {
    const teacherId = await resolveTeacherId(req, res);
    if (!teacherId) return;   // 401/503 already sent

    // _auth lets an unauthenticated GET through as the public demo, which
    // is right for reading a demo board and wrong here: version history is
    // one teacher's own work, and the demo has none to show. Refuse rather
    // than rely on that collection happening to be empty.
    if (teacherId === PUBLIC_TEACHER_ID) {
      res.status(403).json({ error: "The demo board has no version history." });
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const client = await getClientPromise();
    const history = client.db(DB_NAME).collection(HISTORY_COLLECTION);

    const id = typeof req.query?.id === "string" ? req.query.id.trim() : "";
    if (id) {
      // Malformed ids are a 404, not a 500: ObjectId throws on anything
      // that isn't 24 hex characters.
      if (!/^[0-9a-fA-F]{24}$/.test(id)) {
        res.status(404).json({ error: "No such version." });
        return;
      }
      // teacherId in the FILTER, not checked after loading -- one teacher
      // must not be able to read another's version by guessing an id.
      const doc = await history.findOne({ _id: new ObjectId(id), teacherId });
      if (!doc) {
        res.status(404).json({ error: "No such version." });
        return;
      }
      res.status(200).json({
        id: String(doc._id),
        replacedAt: doc.replacedAt,
        units: doc.units || [],
      });
      return;
    }

    const docs = await history
      .find({ teacherId })
      .sort({ replacedAt: -1 })
      .limit(30)
      .toArray();

    res.status(200).json(docs.map((doc) => {
      const units = Array.isArray(doc.units) ? doc.units : [];
      return {
        id: String(doc._id),
        replacedAt: doc.replacedAt,
        unitCount: typeof doc.unitCount === "number" ? doc.unitCount : units.length,
        // Surfaced so a teacher is not restoring a hidden unit blind and
        // then wondering why the board looks empty. Restoring keeps
        // hidden state on purpose -- see CurriculumHistory.jsx.
        hiddenUnitCount: units.filter(u => u?.hidden === true).length,
        lessonCount: units.reduce(
          (n, u) => n + (Array.isArray(u?.lessons) ? u.lessons.length : 0), 0),
        unitNames: units
          .slice(0, NAMES_IN_SUMMARY)
          .map(u => (typeof u?.unit === "string" ? u.unit : ""))
          .filter(Boolean),
      };
    }));
  } catch (err) {
    console.error("[api/curriculumHistory] error", err);
    res.status(500).json({ error: "Internal error" });
  }
}
