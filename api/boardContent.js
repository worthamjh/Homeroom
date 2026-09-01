// Vercel serverless function: Mongo-backed storage for a lesson's Full
// Agenda board content — Essential Question, Agenda, Bell Ringer, Home
// Learning text, and which Agenda lines are checked off (see
// useFullAgendaFields in src/FullAgendaBoard.jsx). Before this endpoint
// existed, all of this lived ONLY in that one browser's localStorage —
// real content a teacher typed in, gone the moment they opened the board
// on a different computer or cleared their browser data. This is the
// server-side mirror of it, same scoping (teacherId + unitIdx +
// lessonTitle) api/assignments.js already uses for uploaded assignments.
//
// One document per (teacherId, unitIdx, lessonTitle) — a lesson's board
// content is independent of every other lesson's, same granularity as
// useFullAgendaFields' storageKey already assumes.
//
// Same trust model as every other Mongo endpoint here today: this stores
// whatever teacherId the client sends, without independently verifying
// the caller's Clerk session server-side. Real hardening (verify via
// @clerk/backend's verifyToken) is the same flagged future work as
// api/assignments.js, api/profile.js, and api/curriculum.js.
import { MongoClient } from "mongodb";
import { resolveTeacherId } from "./_auth.js";
import { capString, LIMITS } from "./_validate.js";

const DEFAULT_TEACHER_ID = "local-teacher";
const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "boardContent";

// The freeform text fields — kept in one list so GET/POST/sanitizing
// don't have to spell each one out in more than one place.
//
// `homeLearning` is deliberately still here even though the Home Learning
// component was removed from the board: nothing reads or writes it any
// more, but leaving it means whatever a teacher had typed there is still
// sitting in Mongo rather than dropped on the next save. Costs one unused
// key; buys back the text if that component ever returns.
const TEXT_FIELDS = ["essentialQuestion", "agenda", "bellRinger", "homeLearning", "bellRingerKamiUrl", "learningGoals"];

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

function docKey({ teacherId, unitIdx, lessonTitle, panelIdx }) {
  const key = {
    teacherId: teacherId ? String(teacherId) : DEFAULT_TEACHER_ID,
    unitIdx: Number(unitIdx),
    lessonTitle: String(lessonTitle),
  };
  // panelIdx is only present for sliding-board panels — flat board and unit
  // board omit it, so their documents stay at the same key they always had.
  if (panelIdx != null && panelIdx !== "") key.panelIdx = Number(panelIdx);
  return key;
}

export default async function handler(req, res) {
  try {
  // Identity comes from the verified session, never from the request --
  // see api/_auth.js. Any teacherId still arriving in the query or body is
  // ignored, so a caller cannot name a teacher they are not.
  const teacherId = await resolveTeacherId(req, res);
  if (!teacherId) return;   // 401/503 already sent
    if (req.method === "GET") {
      const { unitIdx, lessonTitle, panelIdx } = req.query;
      if (unitIdx == null || !lessonTitle) {
        res.status(400).json({ error: "unitIdx and lessonTitle query params are required" });
        return;
      }
      const col = await getCollection();
      const doc = await col.findOne(docKey({ teacherId, unitIdx, lessonTitle, panelIdx }));
      // 200 + null (not 404) when nothing's been saved for this lesson yet —
      // same convention as api/profile.js and api/curriculum.js. The client
      // falls back to its own defaults/localStorage cache in that case.
      res.status(200).json(doc ? toClientShape(doc) : null);
      return;
    }

    if (req.method === "POST") {
      const { unitIdx, lessonTitle, panelIdx, checkedAgendaLines, checkedLearningGoalsLines, ...rest } = req.body || {};
      if (unitIdx == null || !lessonTitle) {
        res.status(400).json({ error: "unitIdx and lessonTitle are required" });
        return;
      }
      const key = docKey({ teacherId, unitIdx, lessonTitle, panelIdx });
      // Partial update — a save only ever touches ONE freeform field at a
      // time (see FullAgendaBoard.jsx's `save`), and toggling an agenda
      // line touches only checkedAgendaLines, so only $set whichever
      // fields actually arrived instead of clobbering the rest of the
      // document with undefined.
      const set = {};
      for (const field of TEXT_FIELDS) {
        if (typeof rest[field] === "string") set[field] = capString(rest[field], LIMITS.TEXT_FIELD);
      }
      if (checkedAgendaLines && typeof checkedAgendaLines === "object") {
        set.checkedAgendaLines = checkedAgendaLines;
      }
      if (checkedLearningGoalsLines && typeof checkedLearningGoalsLines === "object") {
        set.checkedLearningGoalsLines = checkedLearningGoalsLines;
      }
      if (Object.keys(set).length === 0) {
        res.status(400).json({ error: "at least one recognized field is required" });
        return;
      }
      set.updatedAt = new Date();
      const col = await getCollection();
      await col.updateOne(
        key,
        { $set: { ...key, ...set }, $setOnInsert: { createdAt: set.updatedAt } },
        { upsert: true }
      );
      const saved = await col.findOne(key);
      res.status(200).json(toClientShape(saved));
      return;
    }

    if (req.method === "DELETE") {
      // Mirrors "Reset Board" (see resetToDefaults in FullAgendaBoard.jsx):
      // removing the document entirely, rather than overwriting it with
      // defaults, means a future GET returns null and the client falls
      // back to its own defaultFullAgendaContent() — one definition of
      // "default", kept client-side, instead of duplicating it here.
      const { unitIdx, lessonTitle } = req.query;
      if (unitIdx == null || !lessonTitle) {
        res.status(400).json({ error: "unitIdx and lessonTitle query params are required" });
        return;
      }
      const col = await getCollection();
      await col.deleteOne(docKey({ teacherId, unitIdx, lessonTitle, panelIdx }));
      res.status(204).end();
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/boardContent] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}

function toClientShape(doc) {
  const shape = { checkedAgendaLines: doc.checkedAgendaLines || {}, checkedLearningGoalsLines: doc.checkedLearningGoalsLines || {} };
  for (const field of TEXT_FIELDS) {
    if (typeof doc[field] === "string") shape[field] = doc[field];
  }
  return shape;
}
