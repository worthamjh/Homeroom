// Vercel serverless function: Mongo-backed storage for board-formatting
// preferences — background/wall type & color, board surface, board
// arrangement, bulletin board style, sliding boards on/off & count, which
// Board Content components are on, and their display order. Before this
// endpoint existed, ALL of this lived ONLY in that one browser's
// localStorage (see useScopedSetting in src/boardConfig.js) — a teacher's
// carefully-set-up look, gone the moment they opened the board on a
// different computer or cleared their browser data.
//
// One document per teacherId holding an arbitrary key/value map — every
// useScopedSetting call already treats its value as an opaque string
// (a preset id, "true"/"false", a permutation JSON string, ...), so this
// endpoint doesn't need to know what any individual setting means, just
// store whichever keys arrive. Same single-blob-per-teacher shape as
// api/checkedGoals.js, for the same reason: these settings aren't scoped
// to any one lesson.
//
// Identity comes from the verified Clerk session, never from the request
// -- see api/_auth.js. Setting keys are percent-encoded before they become
// part of a Mongo field path -- see api/_validate.js.
import { MongoClient } from "mongodb";
import { resolveTeacherId } from "./_auth.js";
import { classroomIdFrom, TEACHER_SETTINGS_ID, isTeacherLevelSetting, TEACHER_LEVEL_SETTINGS } from "./_classroom.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { isValidSettingKey, encodeSettingKey, decodeSettingKey, LIMITS } from "./_validate.js";

const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "boardSettings";

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
  // see api/_auth.js. Any teacherId still arriving in the query or body is
  // ignored, so a caller cannot name a teacher they are not.
  const teacherId = await resolveTeacherId(req, res, { allowShared: true });   // a shared board may be read signed-out
  if (!teacherId) return;   // 401/503 already sent
  // Fails open if the limiter itself is unavailable -- see _rateLimit.js.
  if (!(await enforceRateLimit(req, res, { teacherId, bucket: "boardSettings" }))) return;
    if (req.method === "GET") {
      const col = await getCollection();
      // The classroom's own settings, with the teacher-level ones (store
      // purchases, tour done) laid over from the teacher document -- those
      // are the same on every board. Both documents may be absent.
      const classroomId = classroomIdFrom(req);
      const [classDoc, teacherDoc] = await Promise.all([
        col.findOne({ teacherId, classroomId }),
        col.findOne({ teacherId, classroomId: TEACHER_SETTINGS_ID }),
      ]);
      const teacherOnly = Object.fromEntries(
        Object.entries(teacherDoc?.settings || {}).filter(([k]) => isTeacherLevelSetting(k))
      );
      const doc = (classDoc || teacherDoc) ? { settings: { ...(classDoc?.settings || {}), ...teacherOnly } } : null;
      // 200 + null (not 404) when nothing's saved yet — same convention as
      // every other endpoint here. The client keeps whatever it already
      // has (its localStorage value, or the hardcoded default) in that case.
      // Keys are stored percent-encoded so a dot in a lesson title cannot
      // become a nested Mongo path (see _validate.js). Decode on the way
      // out so the client sees exactly the key it wrote. Keys stored
      // before this encoding existed contain none of those characters and
      // decode to themselves.
      const settings = doc?.settings
        ? Object.fromEntries(Object.entries(doc.settings).map(([k, v]) => [decodeSettingKey(k), v]))
        : null;
      res.status(200).json(doc ? settings || {} : null);
      return;
    }

    if (req.method === "POST") {
      const { key, value } = req.body || {};
      if (!key || typeof key !== "string" || typeof value !== "string") {
        res.status(400).json({ error: "key and value (both strings) are required" });
        return;
      }
      // Only length and control characters are rejected. The characters
      // Mongo treats specially in a field path are ENCODED rather than
      // refused, because a legitimate per-lesson key carries the teacher's
      // own lesson title -- punctuation, spaces and all. See _validate.js.
      if (!isValidSettingKey(key)) {
        res.status(400).json({ error: "That setting key is empty, too long, or contains control characters." });
        return;
      }
      if (value.length > LIMITS.SETTING_VALUE) {
        res.status(413).json({ error: "That setting value is too large." });
        return;
      }
      const col = await getCollection();
      const now = new Date();
      // Partial update — one setting changes at a time (a teacher tweaking
      // one control), so only $set that one key inside the settings map
      // instead of round-tripping (and risking clobbering) every other
      // setting on every save.
      // Teacher-level keys go to the teacher document, everything else to
      // this classroom's (see TEACHER_LEVEL_SETTINGS in api/_classroom.js).
      const classroomId = isTeacherLevelSetting(key) ? TEACHER_SETTINGS_ID : classroomIdFrom(req);
      await col.updateOne(
        { teacherId: teacherId, classroomId },
        { $set: { teacherId: teacherId, classroomId, [`settings.${encodeSettingKey(key)}`]: value, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      res.status(200).json({ key, value });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/boardSettings] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
