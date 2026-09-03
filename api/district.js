/**
 * GET /api/district?domain=wgmail.org   -> the partner district for that
 *                                          staff email domain, or null
 * GET /api/district?id=webster-groves   -> that district, or null
 *
 * Public: a district's colours, schools and portal links are public
 * information, and the onboarding form asks before the teacher has a
 * profile. Rate-limited per address like the public demo.
 */
import { enforceRateLimit } from "./_rateLimit.js";
import { PUBLIC_TEACHER_ID } from "./_auth.js";
import { findDistrictByDomain, findDistrictById, toClientDistrict } from "./_districts.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    // Per-address bucket: the limiter keys the public id by IP.
    if (!(await enforceRateLimit(req, res, { teacherId: PUBLIC_TEACHER_ID, bucket: "district" }))) return;

    const { domain, id } = req.query || {};
    let doc = null;
    if (typeof id === "string" && id) doc = await findDistrictById(id);
    else if (typeof domain === "string" && domain) doc = await findDistrictByDomain(domain);
    else {
      res.status(400).json({ error: "domain or id is required" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    res.status(200).json(toClientDistrict(doc));
  } catch (err) {
    console.error("[api/district] error", err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
}
