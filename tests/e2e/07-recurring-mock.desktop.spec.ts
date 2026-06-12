/**
 * 07 — Recurring (mock) monthly subscription.
 *
 * Asserts:
 * - DB: subscription active with provider_sub_id mock_sub_*, next_charge_at ≈ +1 month.
 * - Time-travel: setClock(next_charge_at + 1h), daily → second donation (recurring_cycle)
 *   created, receipt row, recurring_receipt email.
 */

import { test, expect } from "@playwright/test";
import { db, latestDonationFor, outboxFor, setClock, daily } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test07@feedsomeone.test";

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("07 — monthly recurring subscription, mock renewal cycle", async ({ page, request }) => {
  const donationId = await donateViaMock(page, {
    qty: 2,
    email: DONOR_EMAIL,
    recurringCadence: "Monthly",
    tipPercent: 0,
  });

  await page.screenshot({
    path: path.join("tests", "evidence", "07-recurring-thanks.png"),
    fullPage: false,
  });

  // ── DB: subscription row ──────────────────────────────────────────────────
  const { data: donor } = await db()
    .from("donors")
    .select("id")
    .eq("email", DONOR_EMAIL)
    .maybeSingle();
  expect(donor).not.toBeNull();

  const { data: sub } = await db()
    .from("subscriptions")
    .select("id, status, provider_sub_id, cadence, next_charge_at")
    .eq("donor_id", donor!.id as string)
    .maybeSingle();
  expect(sub).not.toBeNull();
  expect(sub!.status).toBe("active");
  expect(sub!.cadence).toBe("monthly");
  expect(sub!.provider_sub_id as string).toMatch(/^mock_sub_/);

  // next_charge_at should be approximately +1 month from now
  const nextCharge = new Date(sub!.next_charge_at as string);
  const now = new Date();
  const diffDays = (nextCharge.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  expect(diffDays).toBeGreaterThan(25); // at least 25 days out
  expect(diffDays).toBeLessThan(35);    // no more than 35 days out

  // ── Time-travel: advance to next_charge_at + 1h ────────────────────────────
  const chargeAt = new Date(nextCharge.getTime() + 3600_000);
  await setClock(request, chargeAt.toISOString());

  // Run the daily job (handles mock subscription renewals)
  const dailyResult = await daily(request);
  expect((dailyResult as { renewals: number }).renewals).toBeGreaterThanOrEqual(1);

  // ── Second donation created (recurring_cycle) ─────────────────────────────
  const { data: donations } = await db()
    .from("donations")
    .select("id, type, status")
    .eq("donor_id", donor!.id as string)
    .eq("type", "recurring_cycle")
    .eq("status", "paid");
  expect(donations?.length).toBeGreaterThanOrEqual(1);

  const cycleDonation = donations![0];

  // Receipt for cycle donation
  const { data: cycleReceipt } = await db()
    .from("receipts")
    .select("number")
    .eq("donation_id", cycleDonation.id as string)
    .maybeSingle();
  expect(cycleReceipt).not.toBeNull();
  expect(cycleReceipt!.number as string).toMatch(/^FS-/);

  // recurring_receipt email
  const recurringEmails = await outboxFor(DONOR_EMAIL, "recurring_receipt");
  expect(recurringEmails.length).toBeGreaterThanOrEqual(1);

  await setClock(request, null);
});
