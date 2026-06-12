/**
 * 08 — Payment failure flow.
 *
 * Asserts:
 * - Clicking "Simulate failure" on mock checkout redirects to /donate?canceled=1.
 * - "No charge happened" copy visible.
 * - DB: donation status = 'failed'.
 * - email_outbox: payment_failed email sent.
 */

import { test, expect } from "@playwright/test";
import { db, latestDonationFor, outboxFor, setClock } from "../helpers/db";
import * as path from "node:path";

const DONOR_EMAIL = "test08@feedsomeone.test";

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("08 — simulate payment failure, donation marked failed, email sent", async ({ page }) => {
  // Navigate and fill donation form (no helpers.donateViaMock — we need to take the failure path)
  await page.goto("/donate");
  await page.waitForLoadState("networkidle");

  // qty 1 (chip)
  await page.getByRole("button", { name: "1", exact: true }).click();

  // No tip
  await page.getByRole("button", { name: "No thanks", exact: true }).click();

  // Email
  await page.locator('input[placeholder="your email — no account needed"]').fill(DONOR_EMAIL);

  // Click pay button
  await page.locator("button").filter({ hasText: /^Feed/ }).click();

  // ── Mock checkout page ────────────────────────────────────────────────────
  await page.waitForURL(/\/mock-checkout\//);
  await expect(page.getByRole("button", { name: "Simulate failure" })).toBeVisible();

  // Click failure button
  await page.getByRole("button", { name: "Simulate failure" }).click();

  // ── Back on /donate?canceled=1 ────────────────────────────────────────────
  await page.waitForURL(/\/donate/);
  expect(page.url()).toContain("canceled=1");

  // "No charge happened" copy (from donate/page.tsx: "No charge happened. The plate's still waiting whenever you are.")
  await expect(
    page.getByText(/No charge happened/),
  ).toBeVisible();

  await page.screenshot({
    path: path.join("tests", "evidence", "08-failure-page.png"),
    fullPage: false,
  });

  // ── DB: donation status = failed ──────────────────────────────────────────
  const donation = await latestDonationFor(DONOR_EMAIL);
  expect(donation).not.toBeNull();
  expect(donation!.status).toBe("failed");

  // ── email_outbox: payment_failed ──────────────────────────────────────────
  const failedEmails = await outboxFor(DONOR_EMAIL, "payment_failed");
  expect(failedEmails.length).toBeGreaterThanOrEqual(1);
});
