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
import { resolveTeacherId } from "./_auth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { capString, LIMITS } from "./_validate.js";
import { DEFAULT_CLASSROOM_ID } from "./_classroom.js";

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
function sanitizeImageUrl(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > 2000) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

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

// A board's short address: what goes after gil-bilt.com/board/. Lowercase
// letters, digits and single hyphens, 3 to 40 characters. Chosen by the
// teacher on the Profile page; unique across teachers.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function normalizeSlug(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return SLUG_RE.test(v) && v.length >= 3 && v.length <= 40 ? v : undefined;   // undefined = invalid
}

// A readable address made for a classroom that has none: the school (or
// the teacher's name) and the classroom's name, lowercased and hyphenated
// -- "webster-groves-biology" -- with -2, -3... when someone already has
// it. Jay: "have gilbilt generate a short link that isnt hideous. What if
// multiple teachers use the same link addition?" A teacher can still
// change it on the Profile page; an address they typed is never replaced.
export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")   // é -> e
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function slugTaken(col, teacherId, s) {
  const other = await col.findOne(
    { teacherId: { $ne: String(teacherId) }, $or: [{ slug: s }, { "classrooms.slug": s }] },
    { projection: { _id: 1 } }
  );
  return !!other;
}

// Fills in a slug for every classroom in the list that lacks one, in
// place. Returns true when anything changed.
export async function ensureClassroomSlugs(col, teacherId, { school, teacherName, classrooms }) {
  if (!Array.isArray(classrooms)) return false;
  const own = new Set(classrooms.map(c => c?.slug).filter(Boolean));
  let changed = false;
  for (const c of classrooms) {
    if (!c || c.slug) continue;
    const who = slugify(school) || slugify(teacherName) || "board";
    const what = slugify(c.name) || slugify(c.subject) || "class";
    let base = `${who}-${what}`.replace(/-{2,}/g, "-").slice(0, 40).replace(/-+$/, "");
    if (base.length < 3) base = `${base}-board`.replace(/^-/, "");
    let candidate = base;
    for (let n = 2; own.has(candidate) || await slugTaken(col, teacherId, candidate); n++) {
      if (n > 60) { candidate = `${base.slice(0, 33)}-${Math.random().toString(36).slice(2, 8)}`; break; }
      const suffix = `-${n}`;
      candidate = base.slice(0, 40 - suffix.length).replace(/-+$/, "") + suffix;
    }
    c.slug = candidate;
    own.add(candidate);
    changed = true;
  }
  return changed;
}

export default async function handler(req, res) {
  try {
  // Short address lookup: /api/profile?slug=<name> answers { teacherId }
  // for whoever owns that name, or null. Public on purpose -- it is a
  // directory, and a teacher id is already in every board URL -- and it
  // sits BEFORE the session check because a visitor following a short
  // link has no session. Whether the board then opens is still the
  // shared-board rule in api/_auth.js; this only says which board.
  if (req.method === "GET" && typeof req.query?.slug === "string") {
    if (!(await enforceRateLimit(req, res, { teacherId: "slug-lookup", bucket: "profile" }))) return;
    const slug = normalizeSlug(req.query.slug);
    if (!slug) { res.status(200).json(null); return; }
    const col = await getCollection();
    // The name may belong to the teacher's default board (top-level slug)
    // or to any classroom in their list.
    const doc = await col.findOne({ $or: [{ slug }, { "classrooms.slug": slug }] }, { projection: { teacherId: 1, slug: 1, classrooms: 1 } });
    if (!doc) { res.status(200).json(null); return; }
    const room = (doc.classrooms || []).find(c => c?.slug === slug);
    res.status(200).json({ teacherId: doc.teacherId, classroomId: room ? room.id : DEFAULT_CLASSROOM_ID });
    return;
  }
  // Identity comes from the verified session, never from the request --
  // see api/_auth.js. Any teacherId still arriving in the query or body is
  // ignored, so a caller cannot name a teacher they are not.
  const teacherId = await resolveTeacherId(req, res, { allowShared: true });   // a shared board may be read signed-out
  if (!teacherId) return;   // 401/503 already sent
  // Fails open if the limiter itself is unavailable -- see _rateLimit.js.
  if (!(await enforceRateLimit(req, res, { teacherId, bucket: "profile" }))) return;
    if (req.method === "GET") {
      const col = await getCollection();
      const doc = await col.findOne({ teacherId: String(teacherId) });
      // 200 + null (not 404) when no profile exists yet — the client's
      // "does this teacher need onboarding" check just tests for a falsy
      // body, no need to special-case a 404 response.
      res.status(200).json(doc ? toClientShape(doc) : null);
      return;
    }

    if (req.method === "POST") {
      const { teacherName, school, subject, primaryColor, secondaryColor, headingFont, bodyFont, homeImageUrl, slug: rawSlug, classrooms: rawClassrooms } = req.body || {};
      if (!teacherName) {
        res.status(400).json({ error: "teacherName is required" });
        return;
      }
      const col = await getCollection();
      // The short address, if the teacher set one. Invalid is a 400 with
      // the rule spelled out; taken by someone else is a 409. Absent or
      // blank clears it.
      const slug = normalizeSlug(rawSlug);
      if (slug === undefined) {
        res.status(400).json({ error: "A board address is 3 to 40 characters: lowercase letters, numbers and hyphens, like webster-groves." });
        return;
      }
      // The classroom list, when the client sends one. Each classroom is a
      // course with its own board: name, subject line, short address, home
      // photo. The default classroom ("main") is the board every teacher
      // has had all along; its subject, address and photo are ALSO
      // mirrored to the top-level fields, so the board and the slug lookup
      // keep working for a client that predates classrooms.
      let classrooms;
      if (Array.isArray(rawClassrooms)) {
        if (rawClassrooms.length > 20) {
          res.status(400).json({ error: "That is more classrooms than a profile can hold (20)." });
          return;
        }
        classrooms = [];
        const seenIds = new Set();
        const seenSlugs = new Set();
        for (const raw of rawClassrooms) {
          const id = typeof raw?.id === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(raw.id) ? raw.id : null;
          if (!id || seenIds.has(id)) {
            res.status(400).json({ error: "A classroom in the list has a missing or repeated id." });
            return;
          }
          seenIds.add(id);
          const roomSlug = normalizeSlug(raw.slug);
          if (roomSlug === undefined) {
            res.status(400).json({ error: "A board address is 3 to 40 characters: lowercase letters, numbers and hyphens, like webster-groves." });
            return;
          }
          if (roomSlug) {
            if (seenSlugs.has(roomSlug)) {
              res.status(400).json({ error: `Two of your classrooms have the address "${roomSlug}". Each needs its own.` });
              return;
            }
            seenSlugs.add(roomSlug);
          }
          classrooms.push({
            id,
            name: capString(String(raw.name || "Classroom"), LIMITS.NAME),
            subject: raw.subject ? capString(String(raw.subject), LIMITS.NAME) : null,
            slug: roomSlug,
            homeImageUrl: sanitizeImageUrl(raw.homeImageUrl),
          });
        }
        if (!classrooms.some(c => c.id === DEFAULT_CLASSROOM_ID)) {
          classrooms.unshift({ id: DEFAULT_CLASSROOM_ID, name: subject ? String(subject) : "My classroom", subject: subject ? capString(String(subject), LIMITS.NAME) : null, slug: slug || null, homeImageUrl: sanitizeImageUrl(homeImageUrl) });
        }
        // Any classroom saved without an address gets one made for it.
        await ensureClassroomSlugs(col, teacherId, { school, teacherName, classrooms });
      }
      // Every address in play -- the top-level one and each classroom's --
      // must be nobody else's.
      const wanted = new Set([slug, ...(classrooms || []).map(c => c.slug)].filter(Boolean));
      for (const s of wanted) {
        const taken = await col.findOne(
          { teacherId: { $ne: String(teacherId) }, $or: [{ slug: s }, { "classrooms.slug": s }] },
          { projection: { _id: 1 } }
        );
        if (taken) {
          res.status(409).json({ error: `"${s}" is already someone else's board address. Try another.` });
          return;
        }
      }
      const now = new Date();
      const update = {
        teacherId: String(teacherId),
        // Capped rather than rejected: these are free text a teacher
        // typed, and silently trimming an absurd one beats refusing to
        // save their whole profile over it.
        teacherName: capString(String(teacherName), LIMITS.NAME),
        school: school ? capString(String(school), LIMITS.NAME) : null,
        subject: subject ? capString(String(subject), LIMITS.NAME) : null,
        // Silently falls back to null (→ the board's own defaults, see
        // boardConfig.js) rather than erroring on a malformed value — a
        // stray hex typo shouldn't block saving the rest of the profile.
        primaryColor: sanitizeHexColor(primaryColor, null),
        secondaryColor: sanitizeHexColor(secondaryColor, null),
        headingFont: VALID_HEADING_FONTS.includes(headingFont) ? headingFont : null,
        bodyFont:    VALID_BODY_FONTS.includes(bodyFont)    ? bodyFont    : null,
        // The photo on the board's home screen (a school building, say).
        // An https URL -- an upload lands on Cloudinary -- or a path on
        // this site. Anything else, including a stray "javascript:", is
        // dropped to null, which means no photo.
        homeImageUrl: sanitizeImageUrl(homeImageUrl),
        slug,
        updatedAt: now,
        ...(classrooms ? { classrooms } : {}),
      };
      if (classrooms) {
        const main = classrooms.find(c => c.id === DEFAULT_CLASSROOM_ID);
        update.subject = main.subject;
        update.slug = main.slug;
        update.homeImageUrl = main.homeImageUrl;
      }
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
    homeImageUrl: doc.homeImageUrl || null,
    slug: doc.slug || null,
    // Always a list, even for a profile saved before classrooms existed:
    // then it is the one default classroom, built from the top-level
    // fields, so every client can treat classrooms as the truth.
    classrooms: Array.isArray(doc.classrooms) && doc.classrooms.length
      ? doc.classrooms.map(c => ({ id: c.id, name: c.name || "Classroom", subject: c.subject || "", slug: c.slug || null, homeImageUrl: c.homeImageUrl || null }))
      : [{ id: DEFAULT_CLASSROOM_ID, name: doc.subject || "My classroom", subject: doc.subject || "", slug: doc.slug || null, homeImageUrl: doc.homeImageUrl || null }],
  };
}
