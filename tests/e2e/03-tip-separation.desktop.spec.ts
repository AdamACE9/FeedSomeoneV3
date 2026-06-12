/**
 * 03 — Tip separation: qty 10 with +25% tip.
 *
 * Asserts:
 * - Pre-pay summary shows separate Meals and Tip lines.
 * - DB: tips row amount = 25% of meals amount.
 * - donation.amount_local excludes tip (meals only).
 * - tips table is separate from donations table (structural).
 */

import { test, expect } from "@playwright/test";
import { db, latestDonationFor, setClock } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test03@feedsomeone.test";

// INR price: 2500 paise per child × 10 = 25000 paise
const MEALS_LOCAL = 25_000;
const TIP_LOCAL = Math.round(MEALS_LOCAL * 0.25); // 6250

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("03 — qty 10 +25% tip: summary lines + DB separation", async ({ page }) => {
  await page.goto("/donate");
  await page.waitForLoadState("networkidle");

  // Select qty 10
  await page.getByRole("button", { name: "10", exact: true }).click();

  // +25% tip should already be pre-selected (DEFAULT_TIP_PERCENT = 25)
  // Verify the summary shows both Meals and Tip lines before paying
  await expect(
    page.locator("dl").filter({ hasText: /Meals/ }),
  ).toBeVisible();
  await expect(
    page.locator("dl").filter({ hasText: /Tip \(25%\)/ }),
  ).toBeVisible();

  await page.screenshot({
    path: path.join("tests", "evidence", "03-summary-lines.png"),
    fullPage: false,
  });

  // Now complete the donation
  await page.locator('input[placeholder="your email — no account needed"]').fill(DONOR_EMAIL);
  // Leave tip at +25% (pre-selected default)
  await page.locator("button").filter({ hasText: /^Feed/ }).click();

  await page.waitForURL(/\/mock-checkout\//);
  await page.getByRole("button", { name: "Pay (test) →" }).click();
  await page.waitForURL(/\/thanks\//);

  // ── DB assertions ─────────────────────────────────────────────────────────
  const donation = await latestDonationFor(DONOR_EMAIL);
  expect(donation).not.toBeNull();
  expect(donation!.status).toBe("paid");

  const donationId = donation!.id as string;

  // donation.amount_local = meals only (excludes tip)
  expect(Number(donation!.amount_local)).toBe(MEALS_LOCAL);

  // tips row exists with correct amount
  const { data: tipRow } = await db()
    .from("tips")
    .select("percent, amount_local, currency")
    .eq("donation_id", donationId)
    .maybeSingle();
  expect(tipRow).not.toBeNull();
  expect(tipRow!.percent).toBe(25);
  expect(Number(tipRow!.amount_local)).toBe(TIP_LOCAL);
  expect(tipRow!.currency).toBe("INR");

  // Structural separation: tips is its own table, not a column on donations
  const { data: donRow } = await db()
    .from("donations")
    .select("amount_local")
    .eq("id", donationId)
    .maybeSingle();
  // donation amount_local does NOT include tip
  expect(Number(donRow?.amount_local)).toBe(MEALS_LOCAL);
});
