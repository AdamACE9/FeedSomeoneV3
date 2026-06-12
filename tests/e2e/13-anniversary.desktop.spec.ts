/**
 * 13 — Anniversary email exactly 1 year after first donation.
 *
 * Steps:
 * 1. resetAppState (clean slate).
 * 2. Donate as anniv@test.dev (qty 1).
 * 3. Complete its delivery (advance clock + tick).
 * 4. Set donors.first_donation_at = exactly 1 year ago via service client.
 * 5. Call daily() → email_outbox has anniversary email with "A year ago today".
 * 6. Call daily() again → count still 1 (no duplicate).
 */

import { test, expect } from "@playwright/test";
import { db, resetAppState, setClock, tick, daily, outboxFor } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "anniv@test.dev";

test.beforeAll(async ({ request }) => {
  await resetAppState();
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("13 — anniversary email sent exactly once, contains 'A year ago today'", async ({
  page,
  request,
}) => {
  // ── 1. Donate ─────────────────────────────────────────────────────────────
  const donationId = await donateViaMock(page, {
    qty: 1,
    email: DONOR_EMAIL,
    tipPercent: 0,
  });

  await page.screenshot({
    path: path.join("tests", "evidence", "13-anniversary-thanks.png"),
    fullPage: false,
  });

  // ── 2. Complete delivery: advance clock to scheduled_at + 1min, tick ──────
  const { data: days } = await db()
    .from("donation_days")
    .select("id")
    .eq("donation_id", donationId)
    .maybeSingle();

  if (days) {
    const { data: delivery } = await db()
      .from("deliveries")
      .select("status, scheduled_at")
      .eq("donation_day_id", days.id as string)
      .maybeSingle();

    if (delivery?.status === "scheduled" && delivery?.scheduled_at) {
      const sendAt = new Date(
        new Date(delivery.scheduled_at as string).getTime() + 60_000,
      );
      await setClock(request, sendAt.toISOString());
      await tick(request);
    }
  }

  // ── 3. Set first_donation_at = now − 1 year ────────────────────────────────
  const { data: donor } = await db()
    .from("donors")
    .select("id")
    .eq("email", DONOR_EMAIL)
    .maybeSingle();
  expect(donor).not.toBeNull();

  // "now" in this test context = current wall-clock (before time-travel for daily)
  // We want first_donation_at to appear to be exactly 1 year ago TODAY.
  const fakeNow = new Date();
  const oneYearAgo = new Date(fakeNow.getTime() - 365 * 24 * 3600_000);
  await db()
    .from("donors")
    .update({ first_donation_at: oneYearAgo.toISOString() })
    .eq("id", donor!.id as string);

  // Reset clock to real time (daily job uses real-ish time with the override)
  await setClock(request, null);

  // ── 4. Run daily job ───────────────────────────────────────────────────────
  const dailyResult1 = await daily(request);
  expect((dailyResult1 as { anniversaries: number }).anniversaries).toBeGreaterThanOrEqual(1);

  // Anniversary email exists
  const anniversaryEmails = await outboxFor(DONOR_EMAIL, "anniversary");
  expect(anniversaryEmails.length).toBe(1);
  expect(anniversaryEmails[0].html).toMatch(/A year ago today/i);

  await page.screenshot({
    path: path.join("tests", "evidence", "13-anniversary-email-count.png"),
    fullPage: false,
  });

  // ── 5. Run daily again — no duplicate ─────────────────────────────────────
  await daily(request);
  const anniversaryEmails2 = await outboxFor(DONOR_EMAIL, "anniversary");
  expect(anniversaryEmails2.length).toBe(1); // still exactly 1
});
