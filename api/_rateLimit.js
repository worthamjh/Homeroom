// Per-teacher rate limiting for the API.
//
// WHY MONGO AND NOT A COUNTER IN MEMORY. Each request may land on a
// different warm lambda, so an in-process counter limits one instance and
// nothing else -- it would read as protection while providing close to
// none. Mongo is already on the request path for every endpoint here, so
// a shared counter costs one more round trip against a connection that is
// already open.
//
// FIXED WINDOW, not a sliding log. A sliding window means storing a
// timestamp per request; a fixed window is one integer per teacher per
// minute. The known cost is burstiness at a boundary -- a teacher can
// spend a full window at :59 and another at :00 -- which is the right
// trade for the thing this is actually defending against: a runaway
// client loop, a script pointed at the API, or a curious student with the
// network tab open. It is not a defence against a distributed attack;
// that is Vercel's layer, not ours.
//
// FAILS OPEN, ALWAYS. If Mongo is slow, unreachable, or the write throws,
// the request proceeds. A limiter that takes the app down when it breaks
// is worse than the abuse it prevents -- and this app's whole job is to
// be on a projector when class starts.
import { MongoClient } from "mongodb";
import { PUBLIC_TEACHER_ID } from "./_auth.js";

const DB_NAME = process.env.MONGODB_DB || "homeroom";
const COLLECTION = "rateLimits";

// Per minute, per teacher. Generous on purpose: Build saves on nearly
// every keystroke-ish interaction, and a teacher rearranging a board can
// legitimately fire a lot of writes in a minute. These are set to catch a
// loop, not to police normal use.
const LIMITS = {
  read: 300,
  write: 120,
  // Expensive or sensitive, so much tighter.
  calendarList: 60,    // proxies an upstream Google call
  export: 10,          // reads and serialises every collection
  deleteAccount: 5,    // irreversible
  curriculumHistory: 60,
};

const WINDOW_SEC = 60;

// The public demo board is ONE teacherId shared by every anonymous
// visitor, so counting it per teacher would pool strangers into a single
// bucket and have them 429 each other -- the busier the demo got, the
// more it would break, which is exactly backwards. Count those by client
// address instead.
function bucketKey(teacherId, req) {
  if (teacherId !== PUBLIC_TEACHER_ID) return teacherId;
  const fwd = req.headers?.["x-forwarded-for"];
  const ip = (typeof fwd === "string" ? fwd.split(",")[0] : "").trim()
    || req.socket?.remoteAddress || "unknown";
  return `demo:${ip}`;
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

// Best-effort, once per warm lambda. Without this the collection grows
// without bound; with it, Mongo sweeps expired counters itself. Failure
// here is ignored -- an un-swept counter collection is a housekeeping
// problem, not a reason to refuse a request.
async function ensureTtlIndex(collection) {
  if (global._homeroomRateLimitTtlReady) return;
  global._homeroomRateLimitTtlReady = true;
  try {
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  } catch {
    global._homeroomRateLimitTtlReady = false;
  }
}

function limitFor(bucket, method) {
  if (bucket in LIMITS) return LIMITS[bucket];
  return method === "GET" ? LIMITS.read : LIMITS.write;
}

/**
 * Returns true when the request may proceed. When it returns false a 429
 * has already been sent and the handler should return immediately -- same
 * shape as resolveTeacherId.
 */
export async function enforceRateLimit(req, res, { teacherId, bucket }) {
  try {
    const method = req.method || "GET";
    const limit = limitFor(bucket, method);
    const windowMs = WINDOW_SEC * 1000;
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;

    const client = await getClientPromise();
    const col = client.db(DB_NAME).collection(COLLECTION);
    await ensureTtlIndex(col);

    // One round trip: increment and read back the new value. The _id
    // carries the window, so a new window is simply a new document and
    // the old one expires on its own.
    const doc = await col.findOneAndUpdate(
      { _id: `${bucketKey(teacherId, req)}:${bucket}:${windowStart}` },
      {
        $inc: { n: 1 },
        $setOnInsert: { expiresAt: new Date(windowStart + windowMs * 2) },
      },
      { upsert: true, returnDocument: "after", projection: { n: 1 } }
    );

    const used = doc?.n ?? doc?.value?.n ?? 0;
    if (used > limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Too many requests. Give it a moment and try again.",
        retryAfter,
      });
      return false;
    }
    return true;
  } catch (err) {
    // See the header comment: fail open, loudly in the log and silently
    // to the teacher.
    console.error("[api/_rateLimit] limiter unavailable, allowing request", err);
    return true;
  }
}
