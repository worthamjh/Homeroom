// Everything Homeroom holds for the signed-in teacher, in one JSON file.
//
// Two jobs. For a teacher it is a backup they can keep and read without
// Homeroom existing. For a district IT review it is the answer to "can
// our staff get their data out, and can we see what you actually store" —
// which is a much better answer as a working endpoint than as a
// paragraph.
//
// Identity comes from the verified session like every other endpoint, so
// this can only ever export the caller's own data. There is deliberately
// no teacherId parameter to get wrong.
import { MongoClient } from "mongodb";
import { resolveTeacherId, PUBLIC_TEACHER_ID } from "./_auth.js";

const DB_NAME = process.env.MONGODB_DB || "homeroom";

// Every collection keyed by teacherId, with the shape each one comes back
// as. Listed explicitly rather than discovered, so a new collection has
// to be added here consciously — an export that silently misses data is
// worse than no export.
const COLLECTIONS = [
  { key: "profile", name: "profiles", single: true },
  { key: "curriculum", name: "curricula", single: true },
  { key: "boardSettings", name: "boardSettings", single: true },
  { key: "checkedGoals", name: "checkedGoals", single: true },
  { key: "boardContent", name: "boardContent", single: false },
  { key: "assignments", name: "assignments", single: false },
  { key: "curriculumHistory", name: "curriculaHistory", single: false },
];

function getClientPromise() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set.");
  }
  if (!global._homeroomMongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    global._homeroomMongoClientPromise = client.connect();
  }
  return global._homeroomMongoClientPromise;
}

export default async function handler(req, res) {
  try {
    const teacherId = await resolveTeacherId(req, res);
    if (!teacherId) return;   // 401/503 already sent

    // Export is an ACCOUNT feature, so it needs a real one. The public
    // demo is readable through the ordinary endpoints by design, but
    // "the export endpoint always requires a signed-in teacher" is a
    // cleaner thing to be able to say, and leaves no carve-out to explain.
    if (teacherId === PUBLIC_TEACHER_ID) {
      res.status(401).json({ error: "Sign in to export your own data." });
      return;
    }

    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const client = await getClientPromise();
    const db = client.db(DB_NAME);

    const data = {};
    for (const { key, name, single } of COLLECTIONS) {
      const col = db.collection(name);
      if (single) {
        const doc = await col.findOne({ teacherId }, { projection: { _id: 0 } });
        data[key] = doc || null;
      } else {
        data[key] = await col.find({ teacherId }, { projection: { _id: 0 } }).toArray();
      }
    }

    res.status(200).json({
      exportedAt: new Date().toISOString(),
      teacherId,
      // Named so a future import knows what it is looking at, and so a
      // human opening the file can tell what produced it.
      format: "homeroom-teacher-export",
      formatVersion: 1,
      data,
    });
  } catch (err) {
    console.error("[api/export] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
