#!/usr/bin/env node
/**
 * Process the real FeedSomeone field photos (seed-photos/) and wire them into the
 * live cloud DB as DELIVERED meals, so the homepage carousel shows real children
 * with real "Fed by {donor} in New Delhi · {time}" cards. ADD-only; the 4
 * placeholder-gradient delivered photos are set to 'rejected' so only real meals
 * show. Re-runnable (upserts + fixed UUIDs).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DELHI_KITCHEN = "dde11111-0000-4000-8000-0000000000de";
const SRC = "seed-photos";

const MEALS = [
  { file: "Screenshot 2026-06-14 121957.png", donor: "Danish",   anon: false, time: "16:37", ago: 2 },
  { file: "Screenshot 2026-06-14 121947.png", donor: "Muthian",  anon: false, time: "16:32", ago: 4 },
  { file: "Screenshot 2026-06-14 121933.png", donor: "Mannmeet", anon: false, time: "16:30", ago: 6 },
  { file: "Screenshot 2026-06-14 121920.png", donor: "Anand",    anon: false, time: "16:25", ago: 8 },
  { file: "Screenshot 2026-06-14 121914.png", donor: null,       anon: true,  time: "16:18", ago: 20 },
  { file: "Screenshot 2026-06-14 121859.png", donor: "Danish",   anon: false, time: "16:10", ago: 26 },
  { file: "Screenshot 2026-06-14 121839.png", donor: null,       anon: true,  time: "16:02", ago: 30 },
];

async function processImage(file) {
  return sharp(readFileSync(resolve(SRC, file)))
    .rotate()
    .resize(1000, 1250, { fit: "cover", position: "centre" })
    .modulate({ saturation: 1.06, brightness: 1.02 })
    .sharpen({ sigma: 0.7 })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

function takenAtISO(time, ago) {
  const d = new Date(Date.now() - ago * 3600_000);
  const istDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return new Date(`${istDate}T${time}:00+05:30`).toISOString();
}

// 1. Delhi kitchen
await db.from("kitchens").upsert({ id: DELHI_KITCHEN, name: "FeedSomeone · Kalkaji", city: "New Delhi", country_code: "IN", tz: "Asia/Kolkata", enabled: true }, { onConflict: "id" });

// 2. donors
const donorIds = {};
for (const name of ["Danish", "Muthian", "Mannmeet", "Anand"]) {
  const { data } = await db.from("donors").upsert({ email: `${name.toLowerCase()}@feedsomeone.org`, first_name: name, is_anonymous: false, currency: "INR", tz: "Asia/Kolkata" }, { onConflict: "email" }).select("id").single();
  donorIds[name] = data.id;
}
donorIds._anon = (await db.from("donors").upsert({ email: "guest.delhi@feedsomeone.org", first_name: null, is_anonymous: true, currency: "INR", tz: "Asia/Kolkata" }, { onConflict: "email" }).select("id").single()).data.id;

// 3. anchor donation_day (FK target for assignments) — reuse seed day or make one
let anchorDay = (await db.from("donation_days").select("id").limit(1).maybeSingle()).data?.id;
if (!anchorDay) {
  const don = (await db.from("donations").upsert({
    id: "dde20000-0000-4000-8000-0000000000d0", donor_id: donorIds.Danish, type: "one_time", status: "paid",
    quantity_total: 7, days: 1, per_day_quantity: 7, currency: "INR", amount_local: 17500, amount_inr: 17500,
    donor_tz: "Asia/Kolkata", provider: "seed", provider_session_id: "seed_real_photos",
  }, { onConflict: "id" }).select("id").single()).data.id;
  anchorDay = (await db.from("donation_days").upsert({ id: "dde30000-0000-4000-8000-0000000000d0", donation_id: don, day_index: 1, quantity: 7, status: "delivered" }, { onConflict: "id" }).select("id").single()).data.id;
}

// 4. process + upload + deliver
let n = 0;
for (let i = 0; i < MEALS.length; i++) {
  const m = MEALS[i];
  const path = `real/meal-${String(i + 1).padStart(2, "0")}.jpg`;
  await db.storage.from("photos").upload(path, await processImage(m.file), { contentType: "image/jpeg", upsert: true });
  const photoId = `dde1${String(i + 1).padStart(4, "0")}-0000-4000-8000-0000000000a${i}`;
  await db.from("photos").upsert({ id: photoId, kitchen_id: DELHI_KITCHEN, country_code: "IN", storage_path: path, taken_at: takenAtISO(m.time, m.ago), tz: "Asia/Kolkata", status: "delivered" }, { onConflict: "id" });
  await db.from("photo_assignments").delete().eq("photo_id", photoId);
  await db.from("photo_assignments").insert({ photo_id: photoId, donation_day_id: anchorDay, donor_id: m.anon ? donorIds._anon : donorIds[m.donor] });
  n++;
  console.log(`✓ ${path}  → ${m.anon ? "Someone" : m.donor} · ${m.time}`);
}

// 5. hide placeholder-gradient delivered photos so only real meals show
await db.from("photos").update({ status: "rejected" }).in("id", [9,10,11,12].map(k => `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa${String(k).padStart(2,"0")}`));

console.log(`\nDone: ${n} real meals delivered. Refresh the live site — the carousel is now real children fed in New Delhi.`);
