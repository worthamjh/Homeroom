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

const DEFAULT_TEACHER_ID = "local-teacher";
const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "boardContent";

// The four freeform text fields — kept in one list so GET/POST/sanitizing
// don't have to spell out all four separately in more than one place.
const TEXT_FIELDS = ["essentialQuestion", "agenda", "bellRinger", "homeLearning"];

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

function docKey({ teacherId, unitIdx, lessonTitle }) {
  return {
    teacherId: teacherId ? String(teacherId) : DEFAULT_TEACHER_ID,
    unitIdx: Number(unitIdx),
    lessonTitle: String(lessonTitle),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { teacherId, unitIdx, lessonTitle } = req.query;
      if (unitIdx == null || !lessonTitle) {
        res.status(400).json({ error: "unitIdx and lessonTitle query params are required" });
        return;
      }
      const col = await getCollection();
      const doc = await col.findOne(docKey({ teacherId, unitIdx, lessonTitle }));
      // 200 + null (not 404) when nothing's been saved for this lesson yet —
      // same convention as api/profile.js and api/curriculum.js. The client
      // falls back to its own defaults/localStorage cache in that case.
      res.status(200).json(doc ? toClientShape(doc) : null);
      return;
    }

    if (req.method === "POST") {
      const { teacherId, unitIdx, lessonTitle, checkedAgendaLines, ...rest } = req.body || {};
      if (unitIdx == null || !lessonTitle) {
        res.status(400).json({ error: "unitIdx and lessonTitle are required" });
        return;
      }
      const key = docKey({ teacherId, unitIdx, lessonTitle });
      // Partial update — a save only ever touches ONE freeform field at a
      // time (see FullAgendaBoard.jsx's `save`), and toggling an agenda
      // line touches only checkedAgendaLines, so only $set whichever
      // fields actually arrived instead of clobbering the rest of the
      // document with undefined.
      const set = {};
      for (const field of TEXT_FIELDS) {
        if (typeof rest[field] === "string") set[field] = rest[field];
      }
      if (checkedAgendaLines && typeof checkedAgendaLines === "object") {
        set.checkedAgendaLines = checkedAgendaLines;
      }
      if (Object.keys(set).length === 0) {
        res.status(400).json({ error: "at least one of essentialQuestion, agenda, bellRinger, homeLearning, or checkedAgendaLines is required" });
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
      const { teacherId, unitIdx, lessonTitle } = req.query;
      if (unitIdx == null || !lessonTitle) {
        res.status(400).json({ error: "unitIdx and lessonTitle query params are required" });
        return;
      }
      const col = await getCollection();
      await col.deleteOne(docKey({ teacherId, unitIdx, lessonTitle }));
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
  const shape = { checkedAgendaLines: doc.checkedAgendaLines || {} };
  for (const field of TEXT_FIELDS) {
    if (typeof doc[field] === "string") shape[field] = doc[field];
  }
  return shape;
}
