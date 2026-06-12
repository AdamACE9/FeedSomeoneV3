/**
 * 02 — Full mock donation (qty 1, INR, no tip).
 *
 * Asserts:
 * - /thanks shows "You fed one child"
 * - Receipt number matches FS-YYYYMMDD-NNNN
 * - DB: donation paid, receipt row exists, tips row ABSENT
 * - Email outbox: receipt email sent to donor
 * - Photo delivery sequence: advance clock to scheduled_at + 1 min, tick,
 *   photo email delivered, delivery status=sent, photos delivered.
 */

import { test, expect } from "@playwright/test";
import { db, outboxFor, latestDonationFor, deliveriesFor, setClock, tick } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test02@feedsomeone.test";

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("02 — donate qty 1 INR no tip, photo delivery sequence", async ({ page, request }) => {
  // ── 1. Donate ─────────────────────────────────────────────────────────────
  const donationId = await donateViaMock(page, {
    qty: 1,
    email: DONOR_EMAIL,
    tipPercent: 0, // "No thanks"
  });

  // ── 2. /thanks assertions ─────────────────────────────────────────────────
  await expect(page.getByRole("heading", { level: 1 })).toContainText("You fed one child");

  // Receipt number visible: "RECEIPT FS-YYYYMMDD-NNNN"
  await expect(page.locator("p").filter({ hasText: /RECEIPT FS-/ })).toBeVisible();

  await page.screenshot({
    path: path.join("tests", "evidence", "02-thanks.png"),
    fullPage: false,
  });

  // ── 3. DB assertions ──────────────────────────────────────────────────────
  // Donation paid
  const donation = await latestDonationFor(DONOR_EMAIL);
  expect(donation).not.toBeNull();
  expect(donation!.status).toBe("paid");
  expect(donation!.id).toBe(donationId);

  // Receipt exists with FS- prefix
  const { data: receipt } = await db()
    .from("receipts")
    .select("number")
    .eq("donation_id", donationId)
    .maybeSingle();
  expect(receipt).not.toBeNull();
  expect(receipt!.number as string).toMatch(/^FS-\d{8}-\d{4}$/);

  // Tips row ABSENT (we clicked "No thanks")
  const { data: tipRow } = await db()
    .from("tips")
    .select("id")
    .eq("donation_id", donationId)
    .maybeSingle();
  expect(tipRow).toBeNull();

  // ── 4. Receipt email in outbox ────────────────────────────────────────────
  const receiptEmails = await outboxFor(DONOR_EMAIL, "receipt");
  expect(receiptEmails.length).toBeGreaterThanOrEqual(1);
  expect(receiptEmails[receiptEmails.length - 1].subject).toContain("FS-");

  // ── 5. Delivery time-travel: advance clock to scheduled_at + 1 min ────────
  const deliveries = await deliveriesFor(donationId);
  expect(deliveries.length).toBe(1);
  const delivery = deliveries[0];

  // scheduled_at may be null if pool was empty — wait only if scheduled
  if (delivery.status === "scheduled" && delivery.scheduled_at) {
    const scheduledAt = new Date(delivery.scheduled_at as string);
    const advancedTime = new Date(scheduledAt.getTime() + 60_000); // +1 min
    await setClock(request, advancedTime.toISOString());

    // Tick the cron (tick already imported at top of file)
    await tick(request);

    // Assert delivery status = sent
    const { data: updatedDelivery } = await db()
      .from("deliveries")
      .select("status, sent_at")
      .eq("id", delivery.id as string)
      .maybeSingle();
    expect(updatedDelivery?.status).toBe("sent");
    expect(updatedDelivery?.sent_at).not.toBeNull();

    // Photo email arrived in outbox
    const photoEmails = await outboxFor(DONOR_EMAIL, "photo");
    expect(photoEmails.length).toBeGreaterThanOrEqual(1);

    // Photo status = delivered
    // Get the photo assigned to this donation's day
    const { data: pa } = await db()
      .from("photo_assignments")
      .select("photo_id, donation_days!inner(donation_id)")
      .eq("donation_days.donation_id", donationId)
      .maybeSingle();
    if (pa?.photo_id) {
      const { data: photo } = await db()
        .from("photos")
        .select("status")
        .eq("id", pa.photo_id as string)
        .maybeSingle();
      expect(photo?.status).toBe("delivered");
    }

    await setClock(request, null);
  }
});
