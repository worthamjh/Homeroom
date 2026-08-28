// Vercel serverless function: Mongo-backed storage for a teacher's profile
// (name, school, subject/room) — the short form a brand-new signed-in
// teacher fills out once, before landing on their blank board (see
// src/LandingPage.jsx / src/ProfileOnboarding.jsx). One document per
// teacherId, same scoping scheme as api/assignments.js (a signed-in
// teacher's id is "clerk:<clerk user id>"; DEFAULT_TEACHER_ID/sandbox ids
// never reach here since Landing only shows the onboarding form when
// actually signed in via Clerk).
//
// Same trust model as api/assignments.js today: this endpoint stores
// whatever teacherId the client sends, it does not itself verify the
// caller's Clerk session server-side. Real hardening (verify via
// @clerk/backend's verifyToken, using CLERK_SECRET_KEY) is the same
// future work flagged there, not done in this pass.
import { MongoClient } from "mongodb";

const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "profiles";

// Matches boardConfig.js's DEFAULT_PRIMARY_COLOR/DEFAULT_SECONDARY_COLOR —
// duplicated here (rather than shared) since this file can't import from
// src/ (separate Vercel function bundle). A saved profile's colors, once
// set, become the theme for that teacher's whole blank-shell board (see
// the 2026-08-25 "school/subject title + theme colors" pass) — the
// Webster Groves demo (DEFAULT_TEACHER_ID) never reaches this endpoint's
// colors at all, since only blank-shell teachers get themed.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const VALID_HEADING_FONTS = ["Oswald", "Bebas Neue", "Raleway", "Montserrat", "Anton", "Fjalla One"];
const VALID_BODY_FONTS    = ["Lato", "Open Sans", "Roboto", "Nunito", "Source Sans 3", "Inter"];
function sanitizeHexColor(value, fallback) {
  return typeof value === "string" && HEX_COLOR_RE.test(value) ? value : fallback;
}

// Same warm-lambda connection reuse as api/assignments.js — see the
// comments there for why this is structured as a lazy getter rather than
// connecting at module load time.
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
      if (!teacherId) {
        res.status(400).json({ error: "teacherId query param is required" });
        return;
      }
      const col = await getCollection();
      const doc = await col.findOne({ teacherId: String(teacherId) });
      // 200 + null (not 404) when no profile exists yet — the client's
      // "does this teacher need onboarding" check just tests for a falsy
      // body, no need to special-case a 404 response.
      res.status(200).json(doc ? toClientShape(doc) : null);
      return;
    }

    if (req.method === "POST") {
      const { teacherId, teacherName, school, subject, primaryColor, secondaryColor, headingFont, bodyFont } = req.body || {};
      if (!teacherId || !teacherName) {
        res.status(400).json({ error: "teacherId and teacherName are required" });
        return;
      }
      const col = await getCollection();
      const now = new Date();
      const update = {
        teacherId: String(teacherId),
        teacherName: String(teacherName),
        school: school ? String(school) : null,
        subject: subject ? String(subject) : null,
        // Silently falls back to null (→ the board's own defaults, see
        // boardConfig.js) rather than erroring on a malformed value — a
        // stray hex typo shouldn't block saving the rest of the profile.
        primaryColor: sanitizeHexColor(primaryColor, null),
        secondaryColor: sanitizeHexColor(secondaryColor, null),
        headingFont: VALID_HEADING_FONTS.includes(headingFont) ? headingFont : null,
        bodyFont:    VALID_BODY_FONTS.includes(bodyFont)    ? bodyFont    : null,
        updatedAt: now,
      };
      // Upsert keyed on teacherId — a teacher only ever has one profile
      // document, and re-saving from the onboarding form (or a future
      // "edit profile" surface) should update it in place rather than
      // create a duplicate. $setOnInsert keeps createdAt stable across
      // edits instead of resetting it every save.
      await col.updateOne(
        { teacherId: update.teacherId },
        { $set: update, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      const saved = await col.findOne({ teacherId: update.teacherId });
      res.status(200).json(toClientShape(saved));
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[api/profile] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}

function toClientShape(doc) {
  return {
    teacherId: doc.teacherId,
    teacherName: doc.teacherName,
    school: doc.school || "",
    subject: doc.subject || "",
    primaryColor: doc.primaryColor || null,
    secondaryColor: doc.secondaryColor || null,
    headingFont: doc.headingFont || null,
    bodyFont: doc.bodyFont || null,
  };
}
