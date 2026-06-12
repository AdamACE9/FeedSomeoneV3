/**
 * FeedSomeone production cron — Firebase scheduled functions v2.
 * Job LOGIC lives in the Next.js app (/api/cron/*); these are dumb, reliable pingers.
 *
 * Required config:
 *   secret APP_CRON_SECRET  → firebase functions:secrets:set APP_CRON_SECRET
 *   param  APP_URL          → set at deploy (e.g. https://feedsomeone--<backend>.web.app or custom domain)
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const APP_CRON_SECRET = defineSecret("APP_CRON_SECRET");
const APP_URL = defineString("APP_URL", { description: "Base URL of the FeedSomeone app" });

async function ping(path, secret) {
  const url = `${APP_URL.value().replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  if (!res.ok) {
    logger.error(`${path} → ${res.status}`, { body: body.slice(0, 300) });
    throw new Error(`${path} failed: ${res.status}`);
  }
  logger.info(`${path} → ${res.status}`, { body: body.slice(0, 300) });
}

/** Every minute: due photo deliveries (+ every 5th minute the route also retries unassigned). */
exports.tick = onSchedule(
  {
    schedule: "* * * * *",
    timeZone: "Asia/Kolkata",
    secrets: [APP_CRON_SECRET],
    retryCount: 0, // next tick is 60s away — never double-fire
    memory: "256MiB",
    region: "asia-south1",
  },
  () => ping("/api/cron/tick", APP_CRON_SECRET.value()),
);

/** Daily 00:05 IST: mock-subscription renewals + anniversary emails. */
exports.daily = onSchedule(
  {
    schedule: "5 0 * * *",
    timeZone: "Asia/Kolkata",
    secrets: [APP_CRON_SECRET],
    retryCount: 2,
    memory: "256MiB",
    region: "asia-south1",
  },
  () => ping("/api/cron/daily", APP_CRON_SECRET.value()),
);
