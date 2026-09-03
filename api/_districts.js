// Partner districts: what Gil-Bilt knows about a school district so a
// teacher there gets a board that already looks like theirs.
//
// Jay: "When an account is created with the partner district email
// account, like wgmail.org or ucityschools.org, Gil-Bilt automatically
// assigns the account the school district colors and gives the teacher
// the option to click which school they work (dropdown menu) and that
// option automatically picks the homepage image for the teacher... And
// the footer button options also match the district of the account so
// the user does not have to create the footer buttons themselves."
//
// One document per district in the `districts` collection:
//
//   {
//     id: "webster-groves",                 // stable, url-safe
//     name: "Webster Groves School District",
//     domains: ["wgmail.org", "webster.k12.mo.us"],   // staff email domains, lowercase
//     primaryColor: "#1a1a1a", secondaryColor: "#E87722",
//     headingFont: null, bodyFont: null,   // optional overrides
//     schools: [{ id: "wghs", name: "Webster Groves High School", homeImageUrl: "/images/wghs-building.jpg" }, ...],
//     footerLinks: [{ label: "Canvas", href: "https://wgsd.instructure.com/", icon: "/logos/canvas.png" }, ...],
//   }
//
// Added and edited by script for now (scripts/seed-district.mjs with a
// JSON file under scripts/districts/); an admin page can come later.
// Everything in here is public information -- a district's colours,
// its schools, the public links on its staff portal -- so reads need no
// session.
import { MongoClient } from "mongodb";

const DB_NAME = process.env.MONGODB_DB || "homeroom";
export const DISTRICTS_COLLECTION = "districts";

function getClientPromise() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  if (!global._homeroomMongoClientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI);
    global._homeroomMongoClientPromise = client.connect().catch((err) => {
      global._homeroomMongoClientPromise = undefined;
      throw err;
    });
  }
  return global._homeroomMongoClientPromise;
}

export async function districtsCollection() {
  const client = await getClientPromise();
  return client.db(DB_NAME).collection(DISTRICTS_COLLECTION);
}

export const DISTRICT_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

// The part of an email after the @, lowercased; null if it is not an email.
export function emailDomain(email) {
  const m = String(email || "").trim().toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  return m ? m[1] : null;
}

export async function findDistrictByDomain(domain) {
  const d = String(domain || "").trim().toLowerCase();
  if (!d) return null;
  const col = await districtsCollection();
  return col.findOne({ domains: d });
}

export async function findDistrictById(id) {
  if (!DISTRICT_ID_RE.test(String(id || ""))) return null;
  const col = await districtsCollection();
  return col.findOne({ id: String(id) });
}

// The shape the client sees. `school` is the resolved entry for a
// schoolId when one is given, so the board has its image in one read.
export function toClientDistrict(doc, schoolId) {
  if (!doc) return null;
  const schools = Array.isArray(doc.schools) ? doc.schools.map(s => ({ id: s.id, name: s.name, homeImageUrl: s.homeImageUrl || null })) : [];
  const school = schoolId ? schools.find(s => s.id === schoolId) || null : null;
  return {
    id: doc.id,
    name: doc.name,
    website: doc.website || null,
    primaryColor: doc.primaryColor || null,
    secondaryColor: doc.secondaryColor || null,
    headingFont: doc.headingFont || null,
    bodyFont: doc.bodyFont || null,
    schools,
    school,
    footerLinks: Array.isArray(doc.footerLinks)
      ? doc.footerLinks.filter(l => l && typeof l.href === "string" && /^https?:\/\//.test(l.href)).map(l => ({ label: String(l.label || ""), href: l.href, icon: typeof l.icon === "string" ? l.icon : null }))
      : [],
  };
}
