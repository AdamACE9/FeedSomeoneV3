/**
 * 04 — Scheduled donation: "Daily streak" 5/day × 7 days.
 *
 * Asserts:
 * - /thanks shows "7 days" reference.
 * - donation: days=7, quantity_total=35, per_day_quantity=5.
 * - donation_days: 7 rows.
 * - Day 1 photos assigned (pool has ≥5 available), days 2–7 unassigned.
 * - deliveries: day 1 status=scheduled, days 2–7 status=waiting.
 */

import { test, expect } from "@playwright/test";
import { db, latestDonationFor, setClock } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test04@feedsomeone.test";

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("04 — daily streak 5/day × 7 days DB structure", async ({ page }) => {
  const donationId = await donateViaMock(page, {
    qty: 5,
    email: DONOR_EMAIL,
    scheduleDays: 7,
    tipPercent: 0,
  });

  // ── /thanks mention of 7 days ─────────────────────────────────────────────
  await expect(page.getByText(/7 days/)).toBeVisible();

  await page.screenshot({
    path: path.join("tests", "evidence", "04-thanks-days.png"),
    fullPage: false,
  });

  // ── DB: donation row ──────────────────────────────────────────────────────
  const donation = await latestDonationFor(DONOR_EMAIL);
  expect(donation).not.toBeNull();
  expect(donation!.days).toBe(7);
  expect(donation!.quantity_total).toBe(35); // 5 × 7
  expect(donation!.per_day_quantity).toBe(5);

  // ── DB: 7 donation_days rows ──────────────────────────────────────────────
  const { data: days } = await db()
    .from("donation_days")
    .select("day_index, status, quantity")
    .eq("donation_id", donationId)
    .order("day_index", { ascending: true });

  expect(days?.length).toBe(7);

  // Day 1 should be assigned or partial (pool has 8 photos, need 5 for day 1)
  const day1 = days!.find((d) => d.day_index === 1);
  expect(["assigned", "partial"]).toContain(day1?.status);

  // Days 2–7 should be unassigned (pool only gets day 1 photos on first assign)
  for (const d of days!.filter((d) => d.day_index > 1)) {
    expect(d.status).toBe("unassigned");
  }

  // ── DB: deliveries ────────────────────────────────────────────────────────
  const { data: deliveries } = await db()
    .from("deliveries")
    .select("status, donation_days!inner(day_index, donation_id)")
    .eq("donation_days.donation_id", donationId)
    .order("donation_days(day_index)", { ascending: true });

  expect(deliveries?.length).toBe(7);

  const del1 = deliveries!.find(
    (d) => (d.donation_days as unknown as { day_index: number }).day_index === 1,
  );
  // Day 1 delivery is scheduled (photos assigned)
  expect(del1?.status).toBe("scheduled");

  // Days 2–7 are waiting
  for (const del of deliveries!.filter(
    (d) => (d.donation_days as unknown as { day_index: number }).day_index > 1,
  )) {
    expect(del.status).toBe("waiting");
  }
});
