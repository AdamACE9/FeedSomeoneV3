#!/usr/bin/env node
/**
 * Applies supabase/migrations/*.sql + supabase/seed.sql to ANY Postgres,
 * tracking applied files in _sql_applied so re-runs are safe.
 * Used for Docker-free cloud setup. Usage:
 *   node scripts/apply-sql.mjs "postgresql://postgres.REF:PASSWORD@aws-X.pooler.supabase.com:5432/postgres"
 *   (or set SUPABASE_DB_URL in .env.local and pass nothing)
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function loadEnv(file) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* fine */ }
}
loadEnv(".env.local");

const url = process.argv[2] || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("usage: node scripts/apply-sql.mjs <postgres-connection-string>  (or set SUPABASE_DB_URL)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: url.includes("supabase.co") || url.includes("pooler.supabase.com") ? { rejectUnauthorized: false } : undefined });
await client.connect();
console.log("connected.");

await client.query("create table if not exists _sql_applied (name text primary key, at timestamptz not null default now())");
const { rows } = await client.query("select name from _sql_applied");
const done = new Set(rows.map((r) => r.name));

const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort().map((f) => `supabase/migrations/${f}`);
files.push("supabase/seed.sql");

let applied = 0, skipped = 0;
for (const f of files) {
  if (done.has(f)) { console.log(`↷ skip ${f} (already applied)`); skipped++; continue; }
  const sql = readFileSync(f, "utf8");
  process.stdout.write(`→ ${f} … `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into _sql_applied(name) values ($1)", [f]);
    await client.query("commit");
    console.log("ok");
    applied++;
  } catch (e) {
    await client.query("rollback");
    console.log(`FAILED\n   ${e.message}${e.position ? ` (position ${e.position})` : ""}`);
    await client.end();
    process.exit(1);
  }
}
await client.end();
console.log(`done: ${applied} applied, ${skipped} skipped.`);
