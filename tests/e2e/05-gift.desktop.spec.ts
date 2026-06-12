/**
 * 05 — Gift flow.
 *
 * Asserts:
 * - email_outbox has a gift_notice to the recipient.
 * - delivery recipient_email = gift recipient.
 */

import { test, expect } from "@playwright/test";
import { db, latestDonationFor, outboxFor, setClock } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test05-donor@feedsomeone.test";
const RECIPIENT_EMAIL = "recipient@example.com";

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("05 — gift notification reaches recipient, delivery goes to recipient", async ({ page }) => {
  const donationId = await donateViaMock(page, {
    qty: 1,
    email: DONOR_EMAIL,
    tipPercent: 0,
    gift: {
      recipientName: "Test Recipient",
      recipientEmail: RECIPIENT_EMAIL,
    },
  });

  await page.screenshot({
    path: path.join("tests", "evidence", "05-gift-thanks.png"),
    fullPage: false,
  });

  // ── gift_notice email to recipient ────────────────────────────────────────
  const giftEmails = await outboxFor(RECIPIENT_EMAIL, "gift_notice");
  expect(giftEmails.length).toBeGreaterThanOrEqual(1);

  // ── delivery recipient_email = recipient ──────────────────────────────────
  const donation = await latestDonationFor(DONOR_EMAIL);
  expect(donation).not.toBeNull();
  expect(donation!.id).toBe(donationId);

  const { data: days } = await db()
    .from("donation_days")
    .select("id")
    .eq("donation_id", donationId)
    .limit(1)
    .maybeSingle();
  expect(days).not.toBeNull();

  const { data: delivery } = await db()
    .from("deliveries")
    .select("recipient_email")
    .eq("donation_day_id", days!.id as string)
    .maybeSingle();
  expect(delivery).not.toBeNull();
  expect((delivery!.recipient_email as string).toLowerCase()).toBe(
    RECIPIENT_EMAIL.toLowerCase(),
  );
});
