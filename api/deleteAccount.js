// Delete a teacher's account and everything Gil-Bilt Classroom holds for
// them. The counterpart to api/export.js: a teacher can take their data
// out, and now they can take it away entirely.
//
// A district WILL ask this question, and "you can export but not delete"
// is a poor answer. It is also the only way to clear the test accounts
// that accumulate while working on the app -- without it, every cold
// first-run test leaves a permanent account behind.
//
// ORDER MATTERS. Mongo first, Clerk last:
//   - data first, account last  -> a failure part way leaves the teacher
//     still able to sign in and try again, and us able to see what broke.
//   - account first, data last  -> a failure part way leaves data in Mongo
//     belonging to a Clerk id that no longer exists, which nobody can
//     reach, delete, or account for.
// Neither order is transactional across two systems; this one fails in the
// direction that stays recoverable.
import { MongoClient } from "mongodb";
import { createClerkClient } from "@clerk/backend";
import { resolveTeacherId, PUBLIC_TEACHER_ID } from "./_auth.js";

const DB_NAME = process.env.MONGODB_DB || "homeroom";

// Every collection keyed by teacherId. Listed explicitly rather than
// discovered, for the same reason api/export.js does: a deletion that
// silently misses a collection is worse than one that fails loudly, and a
// new collection should have to be added here consciously.
const COLLECTIONS = [
  "profiles",
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
      global._homeroomMongoClientPromise = undefined;
      throw err;
    });
  }
  return global._homeroomMongoClientPromise;
}

export default async function handler(req, res) {
  try {
    const teacherId = await resolveTeacherId(req, res);
    if (!teacherId) return;   // 401/503 already sent

    // The public demo has no account to delete, and must never be
    // deletable by a passing visitor.
    if (teacherId === PUBLIC_TEACHER_ID) {
      res.status(403).json({ error: "The demo board cannot be deleted." });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Deliberate friction. Deleting is irreversible and there is no undo,
    // so the client must say so explicitly rather than a stray POST being
    // enough.
    if ((req.body || {}).confirm !== "DELETE") {
      res.status(400).json({ error: 'Send { "confirm": "DELETE" } to delete this account.' });
      return;
    }

    const client = await getClientPromise();
    const db = client.db(DB_NAME);

    const deleted = {};
    for (const name of COLLECTIONS) {
      const result = await db.collection(name).deleteMany({ teacherId });
      deleted[name] = result.deletedCount;
    }

    // Then the Clerk user, so the teacher cannot sign back in to an empty
    // shell of an account and wonder where everything went.
    const clerkUserId = teacherId.startsWith("clerk:") ? teacherId.slice(6) : null;
    let clerkDeleted = false;
    if (clerkUserId && process.env.CLERK_SECRET_KEY) {
      try {
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        await clerk.users.deleteUser(clerkUserId);
        clerkDeleted = true;
      } catch (err) {
        // Reported, not thrown. The data is already gone, which is the
        // part that matters and the part that cannot be retried; leaving
        // the teacher with a sign-in that works is recoverable, and
        // telling them "something failed" after their data is deleted
        // would be alarming and useless.
        console.error("[api/deleteAccount] Clerk user deletion failed", err);
      }
    }

    res.status(200).json({ ok: true, deleted, clerkDeleted });
  } catch (err) {
    console.error("[api/deleteAccount] error", err);
    res.status(500).json({ error: "Internal error" });
  }
}
