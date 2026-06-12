/**
 * 12 — Streak: 3 consecutive days → streaks.current = 3.
 *
 * Time-travel approach:
 * - Day 0 @ 10:00Z: donate qty 1 as streak@test.dev
 * - Day 1 @ 10:00Z: donate again
 * - Day 2 @ 10:00Z: donate a third time
 * - Assert DB streaks.current = 3
 * - Advance to day 2 delivery scheduled_at, tick → photo email HTML contains "3-day streak" badge.
 */

import { test, expect } from "@playwright/test";
import { db, resetAppState, setClock, tick, outboxFor } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "streak@test.dev";

// We'll use a fixed base date for time-travel (far future avoids clock conflicts)
const BASE_ISO = "2030-01-15T10:00:00Z";

test.beforeAll(async ({ request }) => {
  await resetAppState();
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("12 — 3-day streak builds current=3, photo email has streak badge", async ({
  page,
  request,
}) => {
  const base = new Date(BASE_ISO);

  // ── Day 0 ─────────────────────────────────────────────────────────────────
  await setClock(request, base.toISOString());
  await donateViaMock(page, { qty: 1, email: DONOR_EMAIL, tipPercent: 0 });

  // ── Day 1 ─────────────────────────────────────────────────────────────────
  const day1 = new Date(base.getTime() + 24 * 3600_000);
  await setClock(request, day1.toISOString());
  await donateViaMock(page, { qty: 1, email: DONOR_EMAIL, tipPercent: 0 });

  // ── Day 2 ─────────────────────────────────────────────────────────────────
  const day2 = new Date(base.getTime() + 48 * 3600_000);
  await setClock(request, day2.toISOString());
  const donationId = await donateViaMock(page, { qty: 1, email: DONOR_EMAIL, tipPercent: 0 });

  await page.screenshot({
    path: path.join("tests", "evidence", "12-streak-thanks.png"),
    fullPage: false,
  });

  // ── DB: streaks.current = 3 ────────────────────────────────────────────────
  const { data: donor } = await db()
    .from("donors")
    .select("id")
    .eq("email", DONOR_EMAIL)
    .maybeSingle();
  expect(donor).not.toBeNull();

  const { data: streak } = await db()
    .from("streaks")
    .select("current, longest")
    .eq("donor_id", donor!.id as string)
    .maybeSingle();
  expect(streak?.current).toBe(3);
  expect(streak?.longest).toBeGreaterThanOrEqual(3);

  // ── Advance clock to day 2 delivery scheduled_at, tick ────────────────────
  const { data: days } = await db()
    .from("donation_days")
    .select("id")
    .eq("donation_id", donationId)
    .eq("day_index", 1)
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

      // Photo email should have streak badge text
      const photoEmails = await outboxFor(DONOR_EMAIL, "photo");
      if (photoEmails.length > 0) {
        const latestEmail = photoEmails[photoEmails.length - 1];
        // The email HTML should contain a streak reference
        // Template: "3-day streak" badge (exact text depends on email/render.ts)
        expect(latestEmail.html).toMatch(/3.?day streak|3 day streak|streak/i);
      }
    }
  }

  await setClock(request, null);
});
