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
// Same trust model as every other Mongo endpoint here today: this stores
// whatever teacherId the client sends, without independently verifying
// the caller's Clerk session server-side. Real hardening (verify via
// @clerk/backend's verifyToken) is the same flagged future work as
// api/assignments.js, api/profile.js, api/curriculum.js, api/boardContent.js,
// and api/checkedGoals.js.
import { MongoClient } from "mongodb";

const DEFAULT_TEACHER_ID = "local-teacher";
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
      const col = await getCollection();
      const doc = await col.findOne({ teacherId: teacherId ? String(teacherId) : DEFAULT_TEACHER_ID });
      // 200 + null (not 404) when nothing's saved yet — same convention as
      // every other endpoint here. The client keeps whatever it already
      // has (its localStorage value, or the hardcoded default) in that case.
      res.status(200).json(doc ? doc.settings || {} : null);
      return;
    }

    if (req.method === "POST") {
      const { teacherId, key, value } = req.body || {};
      if (!key || typeof key !== "string" || typeof value !== "string") {
        res.status(400).json({ error: "key and value (both strings) are required" });
        return;
      }
      const resolvedTeacherId = teacherId ? String(teacherId) : DEFAULT_TEACHER_ID;
      const col = await getCollection();
      const now = new Date();
      // Partial update — one setting changes at a time (a teacher tweaking
      // one control), so only $set that one key inside the settings map
      // instead of round-tripping (and risking clobbering) every other
      // setting on every save.
      await col.updateOne(
        { teacherId: resolvedTeacherId },
        { $set: { teacherId: resolvedTeacherId, [`settings.${key}`]: value, updatedAt: now }, $setOnInsert: { createdAt: now } },
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
