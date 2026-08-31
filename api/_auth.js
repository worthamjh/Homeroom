// Server-side session verification, shared by every Mongo-backed endpoint.
//
// WHAT THIS REPLACES. Until now each endpoint stored whatever `teacherId`
// the client sent and never checked a session — and no endpoint read an
// Authorization header at all, so no login was required either. The
// teacher id is not secret: BuildPage puts it in the board URL
// (/board?teacher=clerk:user_...), which is a link a teacher would
// plausibly share with a colleague. Anyone who had seen one could read or
// overwrite that teacher's units, lessons, assignments and settings.
//
// THE RULE NOW: the teacher id a request operates on is DERIVED FROM THE
// VERIFIED TOKEN, never from the query string or body. A caller cannot
// name someone else's id, because they never get to name one at all. Any
// `teacherId` still arriving in a request is ignored for identity — it is
// left in place only so existing clients keep working unchanged.
//
// The leading underscore keeps Vercel from treating this as a route; it
// is a module, not an endpoint.
import { verifyToken } from "@clerk/backend";

// The public pitch demo (Webster Groves). Readable with no account, which
// is the point of it — but NOT writable, so a passing visitor cannot
// mutate the board Jay demos from. That is a change: signed-out writes to
// it used to persist.
export const PUBLIC_TEACHER_ID = "local-teacher";
const CLERK_ID_PREFIX = "clerk:";

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/**
 * Resolves the teacher this request is allowed to act as, or answers the
 * request itself and returns null.
 *
 * @returns {Promise<string|null>} the teacher id, or null when a response
 *   has already been sent (401/500) and the caller should simply return.
 */
export async function resolveTeacherId(req, res) {
  const token = bearerToken(req);

  if (token) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      // Deliberately not a silent fall-through to trusting the client:
      // a missing secret must fail loudly and closed, or the hardening
      // this file exists for would quietly stop applying in any
      // environment where the variable was forgotten.
      console.error("[api/_auth] CLERK_SECRET_KEY is not set — cannot verify sessions");
      res.status(503).json({ error: "Server auth is not configured (CLERK_SECRET_KEY missing)." });
      return null;
    }
    try {
      const payload = await verifyToken(token, { secretKey });
      if (!payload?.sub) throw new Error("token has no subject");
      return `${CLERK_ID_PREFIX}${payload.sub}`;
    } catch (err) {
      res.status(401).json({ error: "Invalid or expired session." });
      return null;
    }
  }

  // No token. One thing is still allowed: READING the public demo.
  const requested = req.method === "GET" ? req.query?.teacherId : (req.body || {}).teacherId;
  if (req.method === "GET" && String(requested || "") === PUBLIC_TEACHER_ID) {
    return PUBLIC_TEACHER_ID;
  }

  // Everything else — including any sandbox id such as ?teacher=sandbox —
  // gets nothing from the server. Those boards still work; they just live
  // in that browser's localStorage rather than being persisted, which is
  // the correct amount of trust to extend to an unauthenticated caller.
  res.status(401).json({ error: "Sign in required." });
  return null;
}
