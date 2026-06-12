#!/usr/bin/env node
/**
 * Local cron loop — stands in for the Firebase scheduled functions in dev.
 * Every 60s: POST /api/cron/tick. Once per IST day (after 00:05): POST /api/cron/daily.
 * Usage: node scripts/dev-cron.mjs   (run alongside `npm run dev`)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(file) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no file — fine */ }
}
loadEnv(".env.local");
loadEnv(".env");

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SECRET = process.env.CRON_SECRET ?? "";
if (!SECRET) {
  console.error("dev-cron: CRON_SECRET missing (.env.local) — exiting");
  process.exit(1);
}

const istDay = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const istMinutes = () => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date()).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
  return Number(p.hour) * 60 + Number(p.minute);
};

let lastDailyDay = null;

async function call(path) {
  const res = await fetch(`${SITE}${path}`, { method: "POST", headers: { authorization: `Bearer ${SECRET}` } });
  const body = await res.text();
  return `${res.status} ${body.slice(0, 160)}`;
}

async function tick() {
  const stamp = new Date().toISOString().slice(11, 19);
  try {
    console.log(`[${stamp}] tick →`, await call("/api/cron/tick"));
  } catch (e) {
    console.log(`[${stamp}] tick unreachable (dev server down?): ${e.message ?? e}`);
    return;
  }
  if (istMinutes() >= 5 && lastDailyDay !== istDay()) {
    try {
      console.log(`[${stamp}] daily →`, await call("/api/cron/daily"));
      lastDailyDay = istDay();
    } catch (e) {
      console.log(`[${stamp}] daily failed: ${e.message ?? e}`);
    }
  }
}

console.log(`dev-cron: every 60s → ${SITE}/api/cron/tick (daily after 00:05 IST)`);
tick();
setInterval(tick, 60_000);
