// Client for the district lookup on /api/profile: partner districts, looked up by a staff
// email's domain at sign-up (so the form can offer the district's
// colours and schools) or by id. Public reads; see api/_districts.js for
// the shape and the idea.

/** The part of an email after the @, lowercased; null if not an email. */
export function emailDomain(email) {
  const m = String(email || "").trim().toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  return m ? m[1] : null;
}

export async function fetchDistrictByDomain(domain) {
  if (!domain) return null;
  const params = new URLSearchParams({ districtDomain: domain });
  const res = await fetch(`/api/profile?${params}`);
  if (!res.ok) throw new Error(`Failed to look up district (${res.status})`);
  return res.json();   // district | null
}

export async function fetchDistrict(id) {
  if (!id) return null;
  const params = new URLSearchParams({ districtId: id });
  const res = await fetch(`/api/profile?${params}`);
  if (!res.ok) throw new Error(`Failed to load district (${res.status})`);
  return res.json();   // district | null
}
