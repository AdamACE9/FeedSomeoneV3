#!/usr/bin/env node
/**
 * Generates the 12 placeholder meal photos referenced by supabase/seed.sql
 * (seed/photo-01.jpg … photo-12.jpg) and uploads them to the `photos` bucket.
 *
 * These are warm, cinematic, grain-textured abstractions — NOT literal food, but
 * moody documentary-toned light fields that read as intentional photography
 * rather than "sample data". No burned-in text: the timestamp lives in the UI's
 * film-print frame. Replaced 1:1 the moment kitchens upload real photos.
 *
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

const W = 1280, H = 960;

// Warm, varied scenes — each a (base, glow, accent, deep) palette evoking a meal
// under warm light. Ordered so the carousel reads rich, not repetitive.
const SCENES = [
  { base: "#3a1d10", glow: "#E8A33D", accent: "#C4471D", deep: "#1c0f08" },
  { base: "#4a2412", glow: "#F0B45A", accent: "#A33713", deep: "#211511" },
  { base: "#2c1b10", glow: "#E8A33D", accent: "#3E6B3A", deep: "#160d07" },
  { base: "#52260f", glow: "#F3C277", accent: "#C4471D", deep: "#2a1409" },
  { base: "#321a0e", glow: "#E89A3D", accent: "#7a3d18", deep: "#180c06" },
  { base: "#3e2415", glow: "#EFB661", accent: "#3E6B3A", deep: "#1e1109" },
];

function scene(i, t) {
  const s = SCENES[i % SCENES.length];
  // light source drifts across the set so frames feel individually shot
  const lx = 28 + ((i * 53) % 44);
  const ly = 22 + ((i * 31) % 30);
  const r2 = 40 + ((i * 17) % 22);
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="warm" cx="${lx}%" cy="${ly}%" r="78%">
        <stop offset="0%" stop-color="${s.glow}"/>
        <stop offset="34%" stop-color="${s.accent}"/>
        <stop offset="100%" stop-color="${s.base}"/>
      </radialGradient>
      <radialGradient id="bowl" cx="${lx}%" cy="${ly + 6}%" r="${r2}%">
        <stop offset="0%" stop-color="${s.glow}" stop-opacity="0.55"/>
        <stop offset="60%" stop-color="${s.accent}" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="${s.deep}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="vig" cx="50%" cy="46%" r="75%">
        <stop offset="55%" stop-color="${s.deep}" stop-opacity="0"/>
        <stop offset="100%" stop-color="${s.deep}" stop-opacity="0.82"/>
      </radialGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="34"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#warm)"/>
    <g filter="url(#soft)" opacity="0.85">
      <ellipse cx="${W * lx / 100}" cy="${H * ly / 100}" rx="360" ry="300" fill="${s.glow}" opacity="0.32"/>
      <ellipse cx="${W * 0.72}" cy="${H * 0.78}" rx="420" ry="340" fill="${s.deep}" opacity="0.5"/>
      <ellipse cx="${W * 0.2}" cy="${H * 0.84}" rx="320" ry="260" fill="${s.accent}" opacity="0.28"/>
    </g>
    <ellipse cx="${W * lx / 100}" cy="${H * (ly + 6) / 100}" rx="${W * r2 / 140}" ry="${W * r2 / 175}" fill="url(#bowl)"/>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
  </svg>`;
}

async function makeJpeg(i) {
  const base = await sharp(Buffer.from(scene(i)))
    .modulate({ saturation: 1.06, brightness: 1.02 })
    .blur(0.4)
    .toBuffer();
  // fine film grain via gaussian noise, blended soft-light so it sits in the image
  const grain = await sharp({
    create: { width: W, height: H, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 16 } },
  }).png().toBuffer();
  return sharp(base)
    .composite([{ input: grain, blend: "soft-light" }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
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
