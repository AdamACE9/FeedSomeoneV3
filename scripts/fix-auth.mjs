#!/usr/bin/env node
/**
 * Ensures the seeded admin + kitchen users can actually authenticate on the
 * live (cloud) Supabase GoTrue. A raw SQL insert into auth.users can set a
 * bcrypt hash GoTrue won't accept; re-setting the password through the Admin
 * API fixes the hashing. Idempotent — safe to re-run. Then verifies sign-in.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(file) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
loadEnv(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

const USERS = [
  { uuid: "11111111-1111-1111-1111-111111111111", email: "admin@feedsomeone.com", password: "Admin@123", role: "admin" },
  { uuid: "22222222-2222-2222-2222-222222222222", email: "kitchen@feedsomeone.com", password: "Kitchen@123", role: "kitchen" },
];

for (const u of USERS) {
  // Repair via Admin API (correct GoTrue hashing + confirm email)
  const { error: upErr } = await admin.auth.admin.updateUserById(u.uuid, {
    password: u.password,
    email_confirm: true,
  });
  if (upErr) {
    console.log(`update ${u.email}: ${upErr.message} — trying createUser`);
    const { error: cErr } = await admin.auth.admin.createUser({
      email: u.email, password: u.password, email_confirm: true,
    });
    if (cErr) console.log(`  createUser ${u.email}: ${cErr.message}`);
  } else {
    console.log(`repaired ${u.email}`);
  }
}

// Verify sign-in with the public/anon client
let allOk = true;
for (const u of USERS) {
  const pub = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await pub.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error || !data?.session) {
    console.log(`LOGIN FAIL ${u.email}: ${error?.message ?? "no session"}`);
    allOk = false;
  } else {
    console.log(`login OK  ${u.email}`);
  }
}
process.exit(allOk ? 0 : 1);
