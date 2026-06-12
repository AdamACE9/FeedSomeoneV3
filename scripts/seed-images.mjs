#!/usr/bin/env node
/**
 * Generates the 12 placeholder meal photos referenced by supabase/seed.sql
 * (seed/photo-01.jpg … photo-12.jpg) and uploads them to the local `photos`
 * bucket. Warm, documentary-toned placards — clearly marked as samples.
 * Run after `supabase db reset` (bootstrap.sh does this for you).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

function loadEnv(file) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* fine */ }
}
loadEnv(".env.local");
loadEnv(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("seed-images: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key);

const PALETTES = [
  ["#C4471D", "#E8A33D"], ["#A33713", "#C4471D"], ["#E8A33D", "#F3EBDD"],
  ["#3E6B3A", "#E8A33D"], ["#211511", "#C4471D"], ["#C4471D", "#3E6B3A"],
];
const TIMES = ["12:40 PM", "1:05 PM", "1:15 PM", "1:42 PM", "12:25 PM", "2:10 PM",
               "12:55 PM", "1:30 PM", "1:08 PM", "12:33 PM", "1:51 PM", "2:02 PM"];

async function makeJpeg(i) {
  const [a, b] = PALETTES[i % PALETTES.length];
  const svg = `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#g)"/>
  <circle cx="600" cy="430" r="240" fill="#FFFDF9" opacity="0.92"/>
  <circle cx="600" cy="430" r="170" fill="${a}" opacity="0.85"/>
  <text x="600" y="445" font-family="monospace" font-size="44" fill="#FFFDF9" text-anchor="middle" font-weight="bold">${TIMES[i]}</text>
  <text x="600" y="780" font-family="monospace" font-size="30" fill="#FFFDF9" text-anchor="middle" opacity="0.95">SAMPLE PLATE №${String(i + 1).padStart(2, "0")}</text>
  <text x="600" y="830" font-family="monospace" font-size="22" fill="#FFFDF9" text-anchor="middle" opacity="0.8">REAL PHOTOS COME FROM REAL KITCHENS</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toBuffer();
}

let ok = 0;
for (let i = 0; i < 12; i++) {
  const name = `seed/photo-${String(i + 1).padStart(2, "0")}.jpg`;
  const buf = await makeJpeg(i);
  const { error } = await db.storage.from("photos").upload(name, buf, { contentType: "image/jpeg", upsert: true });
  if (error) console.error(`✗ ${name}: ${error.message}`);
  else { ok++; console.log(`✓ ${name}`); }
}
console.log(`seed-images: ${ok}/12 uploaded`);
process.exit(ok === 12 ? 0 : 1);
