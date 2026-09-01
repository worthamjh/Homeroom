// Clerk -> Gil-Bilt webhook. Today it handles one event: user.deleted.
//
// WHY THIS EXISTS. api/deleteAccount.js is our delete button, and it does
// the right thing in the right order. But it is not the only way a user
// disappears. Clerk's own Account portal -- reachable from the avatar
// menu on every page -- has its own "Delete account", and the Clerk
// dashboard can delete a user too. Both bypass us entirely, and leave
// every one of our seven collections holding documents keyed to a
// clerk:<id> that no longer exists: unreachable, invisible, and
// impossible to remove from inside the app. That is precisely the
// failure mode deleteAccount.js's header warns about, arrived at from the
// other direction.
//
// So the cleanup is driven by the event rather than by our button. Press
// whichever delete you like; the data goes.
//
// Deliberately NOT reusing deleteAccount.js: that one authenticates a
// teacher deleting themselves via a session. This one authenticates
// Clerk via a signature, and must never accept a session -- they are
// different trust models that happen to share a cleanup.
import { MongoClient } from "mongodb";
import crypto from "crypto";

const DB_NAME = process.env.MONGODB_DB || "homeroom";

// Same list as api/deleteAccount.js and api/export.js, for the same
// reason: a deletion that silently misses a collection is worse than one
// that fails loudly, so adding a collection should be a conscious act in
// all three places.
const COLLECTIONS = [
  "profiles",
  "curricula",
  "curriculaHistory",
  "boardSettings",
  "checkedGoals",
  "boardContent",
  "assignments",
];

// Vercel parses a JSON body by default, but signature verification needs
// the EXACT bytes Clerk signed -- re-serialising a parsed object does not
// reliably reproduce them (key order, whitespace, unicode escapes), and a
// mismatch would reject every legitimate delivery.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Verifies a Svix signature (the scheme Clerk uses) by hand rather than
 * pulling in the svix package: it is one HMAC, and a webhook that can
 * delete every teacher's data is a poor place to add a dependency.
 */
function verify(rawBody, headers, secret) {
  const id = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signature = headers["svix-signature"];
  if (!id || !timestamp || !signature) return false;

  // Reject replays of an old delivery. Svix's own tolerance is 5 minutes.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  // whsec_<base64>; the bytes after the prefix are the key.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody.toString("utf8")}`)
    .digest("base64");

  // The header carries a space-separated list of "v1,<sig>" so a secret
  // can be rotated without dropping deliveries. Any match is a pass.
  const expectedBuf = Buffer.from(expected);
  return String(signature).split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const buf = Buffer.from(sig);
    // Length check first: timingSafeEqual throws on a length mismatch.
    return buf.length === expectedBuf.length && crypto.timingSafeEqual(buf, expectedBuf);
  });
}

function getClientPromise() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set.");
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
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    // Refuse rather than fail open. An unverified caller must never be
    // able to reach a routine whose whole job is deleting data.
    console.error("[api/clerkWebhook] CLERK_WEBHOOK_SECRET is not set; refusing.");
    res.status(503).json({ error: "Webhook not configured." });
    return;
  }

  try {
    const raw = await readRawBody(req);
    if (!verify(raw, req.headers, secret)) {
      res.status(401).json({ error: "Bad signature." });
      return;
    }

    const event = JSON.parse(raw.toString("utf8"));
    if (event?.type !== "user.deleted") {
      // Acknowledged, not acted on. Returning 200 stops Clerk retrying
      // events we simply do not handle.
      res.status(200).json({ ok: true, ignored: event?.type || "unknown" });
      return;
    }

    const userId = event?.data?.id;
    if (!userId) {
      res.status(200).json({ ok: true, ignored: "user.deleted without an id" });
      return;
    }

    const teacherId = `clerk:${userId}`;
    const client = await getClientPromise();
    const db = client.db(DB_NAME);

    const deleted = {};
    for (const name of COLLECTIONS) {
      const result = await db.collection(name).deleteMany({ teacherId });
      deleted[name] = result.deletedCount;
    }

    console.log("[api/clerkWebhook] cleaned up after", teacherId, deleted);
    res.status(200).json({ ok: true, teacherId, deleted });
  } catch (err) {
    console.error("[api/clerkWebhook] error", err);
    // A 500 makes Clerk retry, which is what we want: the alternative is
    // data left behind with nothing to notice it.
    res.status(500).json({ error: "Internal error" });
  }
}
