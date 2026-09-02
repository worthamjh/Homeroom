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
import { resolveTeacherId } from "./_auth.js";
import { classroomIdFrom } from "./_classroom.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { payloadTooBig } from "./_validate.js";

const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "curricula";
// Every previous version of a teacher's units, so a bad save is
// recoverable. A curriculum is the most expensive thing a teacher builds
// here -- hours of typing -- and until now a single overwrite was final:
// no undo, no backups, nothing to restore from. An export would only help
// someone who thought to run one first, which nobody does before the
// thing they did not expect.
//
// Written on the way IN, before the overwrite, so what is kept is the
// state that was actually good. Trimmed to the most recent
// CURRICULUM_HISTORY_LIMIT per teacher: enough to walk back through a bad
// afternoon, not an unbounded log of every keystroke-triggered save.
const HISTORY_COLLECTION = "curriculaHistory";
const CURRICULUM_HISTORY_LIMIT = 30;

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
  if (!(await enforceRateLimit(req, res, { teacherId, bucket: "curriculum" }))) return;
    // One board per classroom: every read and write below is keyed by
    // the classroom as well as the teacher (see api/_classroom.js).
    const classroomId = classroomIdFrom(req);
    if (req.method === "GET") {
      const col = await getCollection();
      const doc = await col.findOne({ teacherId: String(teacherId), classroomId });
      res.status(200).json(doc ? doc.units : null);
      return;
    }

    if (req.method === "POST") {
      const { units } = req.body || {};
      // Checked before sanitising: a cap that only applies after the
      // payload has been walked has already done the expensive part.
      if (payloadTooBig(units)) {
        res.status(413).json({ error: "That curriculum is too large to save." });
        return;
      }
      const cleanUnits = sanitizeUnits(units);
      if (!cleanUnits) {
        res.status(400).json({ error: "a non-empty units array is required" });
        return;
      }
      const col = await getCollection();
      const now = new Date();

      // Snapshot what is there BEFORE replacing it. Best-effort on
      // purpose: if history ever fails, the teacher's save must still go
      // through -- a safety net that can block the thing it protects is
      // worse than no safety net.
      try {
        const previous = await col.findOne({ teacherId, classroomId });
        if (previous?.units?.length) {
          const client = await getClientPromise();
          const history = client.db(DB_NAME).collection(HISTORY_COLLECTION);
          await history.insertOne({
            teacherId,
            classroomId,
            units: previous.units,
            replacedAt: now,
            unitCount: previous.units.length,
          });
          // Trim to the newest N for this teacher.
          const stale = await history
            .find({ teacherId, classroomId }, { projection: { _id: 1 } })
            .sort({ replacedAt: -1 })
            .skip(CURRICULUM_HISTORY_LIMIT)
            .toArray();
          if (stale.length) {
            await history.deleteMany({ _id: { $in: stale.map(d => d._id) } });
          }
        }
      } catch (err) {
        console.error("[api/curriculum] history snapshot failed (save continuing)", err);
      }

      await col.updateOne(
        { teacherId: String(teacherId), classroomId },
        { $set: { teacherId: String(teacherId), classroomId, units: cleanUnits, updatedAt: now }, $setOnInsert: { createdAt: now } },
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
