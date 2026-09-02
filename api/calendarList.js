// Proxy for Google Calendar API v3 — routes the browser's token through a
// server-side request to avoid CORS issues inside the BuildPage iframe.
//
// WHAT CHANGED AND WHY. This used to accept the caller's Google access
// token as a QUERY PARAMETER (?accessToken=ya29....). A query string is
// the one place a credential must never go: it lands in Vercel's request
// logs, in any proxy or CDN log between here and the browser, in browser
// history, and in the Referer header of anything the page loads next. The
// token is now read from the Authorization header only, which none of
// those record. The old query form is deliberately NOT accepted as a
// fallback -- leaving it in would mean the logging exposure continued for
// anyone on a stale bundle, which is exactly the case that matters.
//
// It also now requires a signed-in Homeroom session. Strictly, the proxy
// could only ever read the calendar list belonging to whatever Google
// token it was handed, so this is not what stops a caller reading someone
// else's calendars. What it stops is an anonymous internet user pointing
// their own token at our infrastructure and using it as a free, unlogged
// relay to googleapis.com.
import { resolveTeacherId } from "./_auth.js";
import { enforceRateLimit } from "./_rateLimit.js";

// Google's own call gets a ceiling well under Vercel's function timeout,
// so a hung upstream returns a clean 504 instead of holding the lambda
// open until the platform kills it.
const UPSTREAM_TIMEOUT_MS = 10000;

const CALENDAR_LIST_URL =
  "https://www.googleapis.com/calendar/v3/users/me/calendarList" +
  "?minAccessRole=reader&fields=items(id,summary,backgroundColor,primary,accessRole,deleted)";

// ?acl=<calendarId>: the calendar's sharing rules instead of the list.
// acl.list is allowed under the calendar.readonly scope the picker already
// holds (Google's reference lists it), so this needs no new consent. The
// rule with scope.type "default" is the public one: role "reader" means
// public with event details, "freeBusyReader" means public as free/busy
// only, and no such rule means private. The client turns that into a
// warning it can state as a fact -- the old one had to hedge, and Jay
// read the hedge as a wrong verdict on a calendar he had shared.
const aclUrl = (calendarId) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/acl?fields=items(scope,role)`;

function publicVisibility(aclItems) {
  const rule = (aclItems || []).find(item => item?.scope?.type === "default");
  if (!rule) return "none";
  if (rule.role === "freeBusyReader") return "freebusy";
  return "details";
}
// accessRole and deleted are not decoration: a teacher cannot change the
// sharing on a calendar they only read, and a deleted one cannot be
// embedded at all. Without these the picker cannot tell either case from
// a calendar that will work, so it offered all of them alike.

function googleToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  // Two bearer tokens are in play on this request: Clerk's session token,
  // which resolveTeacherId reads from `Authorization`, and the caller's
  // Google OAuth token. They cannot share a header, so the Google one
  // travels in its own.
  const google = req.headers?.["x-google-access-token"];
  if (typeof google === "string" && google.trim()) return google.trim();
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

export default async function handler(req, res) {
  try {
    const teacherId = await resolveTeacherId(req, res);
    if (!teacherId) return;   // 401/503 already sent
    // Fails open if the limiter itself is unavailable -- see _rateLimit.js.
    if (!(await enforceRateLimit(req, res, { teacherId, bucket: "calendarList" }))) return;

    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const accessToken = googleToken(req);
    if (!accessToken) {
      res.status(400).json({ error: "Google access token is required (send it in the X-Google-Access-Token header)." });
      return;
    }

    const aclFor = typeof req.query?.acl === "string" && req.query.acl.trim() ? req.query.acl.trim() : null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let upstream;
    try {
      upstream = await fetch(aclFor ? aclUrl(aclFor) : CALENDAR_LIST_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        res.status(504).json({ error: "Google Calendar API timed out." });
        return;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      // Deliberately does NOT forward Google's response body. It can echo
      // back parts of the request (the token among them) and there is
      // nothing in it a teacher can act on. The status is enough for the
      // client to tell "reauthorize" (401/403) from "try later" (5xx), and
      // the detail stays in the server log where only we can read it.
      const detail = await upstream.text().catch(() => "");
      console.error("[api/calendarList] Google error", upstream.status, detail.slice(0, 200));
      res.status(upstream.status === 401 || upstream.status === 403 ? upstream.status : 502)
         .json({ error: "Google Calendar API error", status: upstream.status });
      return;
    }

    // Parsed inside the try so malformed JSON becomes a 500 with a logged
    // reason. The old version parsed in a stream callback outside any
    // handler, where a throw resolved nothing and hung the function until
    // the platform timed it out.
    const data = await upstream.json();
    if (aclFor) {
      res.status(200).json({ visibility: publicVisibility(data.items) });
      return;
    }
    res.status(200).json(data);
  } catch (err) {
    console.error("[api/calendarList] error", err);
    res.status(500).json({ error: "Internal error" });
  }
}
