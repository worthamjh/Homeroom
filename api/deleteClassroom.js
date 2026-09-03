/**
 * POST /api/deleteClassroom  { classroomId, confirm: "DELETE" }
 *
 * Removes one of the signed-in teacher's classrooms and everything stored
 * for it: its units and lessons, their history, its board settings, its
 * board content (goals, agendas, bell ringer and exit slip links, the
 * unit notebooks' links), its assignments, and its checked goals. The
 * teacher's other classrooms, profile, and store purchases (which are
 * teacher-level, see api/_classroom.js) are untouched.
 *
 * Files the classroom made in the teacher's Drive (bell ringers, exit
 * slips, notebooks) and pictures uploaded to Cloudinary are NOT removed:
 * the app never deletes from a teacher's Drive, and the same file may be
 * open somewhere else. The Drive folders are theirs to tidy.
 *
 * "main" cannot be deleted -- it is the classroom every profile has and
 * the one a board URL without ?class= means. Delete-the-account is the
 * way to remove that one (api/deleteAccount.js). The demo teacher cannot
 * delete anything.
 *
 * Irreversible, so the confirm string is required, the same friction as
 * deleting an account: a stray POST must not be enough.
 */
import { MongoClient } from "mongodb";
import { resolveTeacherId, PUBLIC_TEACHER_ID } from "./_auth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { DEFAULT_CLASSROOM_ID, TEACHER_SETTINGS_ID } from "./_classroom.js";

const DB_NAME = process.env.MONGODB_DB || "homeroom";

// Every collection that carries a classroomId. Explicit, like
// api/deleteAccount.js: a new per-classroom collection has to be added
// here on purpose, or a deleted classroom leaves orphans behind.
const CLASSROOM_COLLECTIONS = [
  "curricula",
  "curriculaHistory",
  "boardSettings",
  "checkedGoals",
  "boardContent",
  "assignments",
];

function getClientPromise() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set.");
  }
  if (!global._homeroomMongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    global._homeroomMongoClientPromise = client.connect().catch((err) => {
      global._homeroomMongoClientPromise = null;
      throw err;
    });
  }
  return global._homeroomMongoClientPromise;
}

export default async function handler(req, res) {
  try {
    const teacherId = await resolveTeacherId(req, res);
    if (!teacherId) return;   // 401/503 already sent
    if (!(await enforceRateLimit(req, res, { teacherId, bucket: "deleteClassroom" }))) return;

    if (teacherId === PUBLIC_TEACHER_ID) {
      res.status(403).json({ error: "The demo board's classrooms cannot be deleted." });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { classroomId, confirm } = req.body || {};
    if (confirm !== "DELETE") {
      res.status(400).json({ error: 'Send { "confirm": "DELETE" } to delete a classroom.' });
      return;
    }
    if (typeof classroomId !== "string" || !classroomId || classroomId.length > 40) {
      res.status(400).json({ error: "classroomId is required." });
      return;
    }
    if (classroomId === DEFAULT_CLASSROOM_ID || classroomId === TEACHER_SETTINGS_ID) {
      res.status(400).json({ error: "Your main classroom can't be deleted. To remove everything, delete your account instead." });
      return;
    }

    const client = await getClientPromise();
    const db = client.db(DB_NAME);
    const profiles = db.collection("profiles");

    const profile = await profiles.findOne({ teacherId }, { projection: { classrooms: 1 } });
    const room = (profile?.classrooms || []).find(c => c?.id === classroomId);
    if (!room) {
      res.status(404).json({ error: "That classroom isn't on your profile." });
      return;
    }

    // The profile entry first, so the classroom is gone from every menu
    // even if a later collection wipe fails; the data wipes are each
    // idempotent and can be re-run.
    await profiles.updateOne({ teacherId }, { $pull: { classrooms: { id: classroomId } }, $set: { updatedAt: new Date() } });

    const deleted = {};
    for (const name of CLASSROOM_COLLECTIONS) {
      const result = await db.collection(name).deleteMany({ teacherId, classroomId });
      deleted[name] = result.deletedCount;
    }

    res.status(200).json({ ok: true, classroomId, name: room.name || null, deleted });
  } catch (err) {
    console.error("[api/deleteClassroom] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
