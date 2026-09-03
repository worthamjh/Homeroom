// Adds or updates one partner district from a JSON file (see
// scripts/districts/*.json and api/_districts.js for the shape).
//
//   node scripts/seed-district.mjs scripts/districts/webster-groves.json homeroom_dev
//   node scripts/seed-district.mjs scripts/districts/webster-groves.json homeroom
//
// Reads MONGODB_URI from .env.local. Upserts on `id`; safe to re-run.
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";

const [file, dbName] = process.argv.slice(2);
if (!file || !["homeroom", "homeroom_dev"].includes(dbName)) {
  console.error("usage: node scripts/seed-district.mjs <district.json> <homeroom|homeroom_dev>");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const district = JSON.parse(readFileSync(file, "utf8"));
if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(district.id || "")) throw new Error("district.id must be url-safe (letters, digits, hyphens)");
district.domains = (district.domains || []).map(d => String(d).trim().toLowerCase()).filter(Boolean);
for (const s of district.schools || []) {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(s.id || "")) throw new Error(`school id "${s.id}" must be url-safe`);
}

const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
await client.connect();
const col = client.db(dbName).collection("districts");
await col.createIndex({ id: 1 }, { unique: true });
await col.createIndex({ domains: 1 });
const now = new Date();
const r = await col.updateOne({ id: district.id }, { $set: { ...district, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
console.log(`[${dbName}] ${district.id}: ${r.upsertedCount ? "inserted" : "updated"} (${district.schools?.length || 0} schools, ${district.footerLinks?.length || 0} links, domains ${district.domains.join(", ")})`);
await client.close();
