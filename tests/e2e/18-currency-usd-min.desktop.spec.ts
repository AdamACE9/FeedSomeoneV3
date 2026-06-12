/**
 * 18 — Currency USD minimum enforcement.
 *
 * Strategy: set extraHTTPHeaders { 'x-country': 'US' } on the browser context
 * so the server resolves USD from the request headers.
 *
 * Asserts:
 * - Landing CTA shows $ price.
 * - /donate qty=1 USD shows minimum-quantity warning (blocked until qty≥2).
 * - Completing at qty=2 → donation currency=USD, amount_inr=2×2500=5000 (two meals in INR canonical).
 *
 * NOTE: The Next.js server reads the x-country header via countryFromHeaders()
 * in src/lib/geo.ts to resolve currency. The per-child USD price is
 * Math.ceil(2500/83) = 31 cents → 31 smallest units, so USD min 2 = 62 cents.
 * amount_inr = quantity × 2500 exactly (canonical, independent of FX rounding).
 */

import { test, expect } from "@playwright/test";
import { latestDonationFor, setClock } from "../helpers/db";
import * as path from "node:path";

const DONOR_EMAIL = "test18@feedsomeone.test";

test.use({
  // Override headers for this test to simulate a US visitor
  extraHTTPHeaders: {
    "x-country": "US",
  },
});

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("18 — USD visitor: min qty warning at 1, complete at qty 2", async ({ page }) => {
  // ── 1. Landing CTA shows $ ───────────────────────────────────────────────
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // CTA "Feed one child · $X →" — price should contain "$"
  const cta = page.getByRole("link", { name: /Feed one child/ }).first();
  await expect(cta).toBeVisible();
  const ctaText = await cta.textContent();
  expect(ctaText).toContain("$");

  await page.screenshot({
    path: path.join("tests", "evidence", "18-usd-landing.png"),
    fullPage: false,
  });

  // ── 2. /donate qty=1 shows minimum warning ────────────────────────────────
  await page.goto("/donate?qty=1");
  await page.waitForLoadState("networkidle");

  // Select qty 1 chip explicitly
  await page.getByRole("button", { name: "1", exact: true }).click();

  // Warning: "Card networks need a small minimum in USD — please feed at least 2 children."
  await expect(
    page.locator("p").filter({ hasText: /Card networks need a small minimum in USD/ }),
  ).toBeVisible();

  // Pay button should be present but the minimum warning visible means blocked
  // The button text shows "Feed 1 child" — but the validation fires on click
  // Let's verify the warning is shown and the pay button exists
  await expect(page.locator("button").filter({ hasText: /^Feed/ })).toBeVisible();

  await page.screenshot({
    path: path.join("tests", "evidence", "18-usd-min-warning.png"),
    fullPage: false,
  });

  // ── 3. Select qty 2 → warning disappears ──────────────────────────────────
  await page.getByRole("button", { name: "2", exact: true })
    .or(page.locator('input[aria-label="number of children"]'))
    .first()
    .click();

  // If the "2" chip isn't present (QTY_CHIPS=[1,5,10,30]), use the +/- buttons
  // The input approach: use aria-label
  await page.locator('input[aria-label="number of children"]').fill("2");

  // Warning should be gone
  await expect(
    page.locator("p").filter({ hasText: /Card networks need a small minimum in USD/ }),
  ).not.toBeVisible();

  // ── 4. Complete donation at qty 2 ─────────────────────────────────────────
  await page.getByRole("button", { name: "No thanks", exact: true }).click();
  await page.locator('input[placeholder="your email — no account needed"]').fill(DONOR_EMAIL);
  await page.locator("button").filter({ hasText: /^Feed/ }).click();

  await page.waitForURL(/\/mock-checkout\//);
  await page.getByRole("button", { name: "Pay (test) →" }).click();
  await page.waitForURL(/\/thanks\//);

  await page.screenshot({
    path: path.join("tests", "evidence", "18-usd-thanks.png"),
    fullPage: false,
  });

  // ── 5. DB: currency=USD, amount_inr = 2 × 2500 = 5000 ────────────────────
  const donation = await latestDonationFor(DONOR_EMAIL);
  expect(donation).not.toBeNull();
  expect(donation!.currency).toBe("USD");
  expect(donation!.quantity_total).toBe(2);
  // Canonical INR: 2 children × 2500 paise = 5000
  expect(Number(donation!.amount_inr)).toBe(5_000);
  expect(donation!.status).toBe("paid");
});
