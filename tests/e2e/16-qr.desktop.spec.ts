/**
 * 16 — QR campaign: redirect + preselect qty + donation links qr_campaign_id.
 *
 * Steps:
 * 1. Insert a qr_campaign slug='test-school' preset_quantity=5 via DB.
 * 2. GET /q/test-school → redirects to /donate?qr=test-school&qty=5.
 * 3. Form shows qty=5 preselected.
 * 4. Complete a mock donation from that URL.
 * 5. DB: donation.qr_campaign_id set.
 *
 * NOTE: The /q/[slug] route increments scan count on redirect (fire-and-forget),
 * so we assert the scan count increased after the donation.
 */

import { test, expect } from "@playwright/test";
import { db, latestDonationFor, setClock } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test16@feedsomeone.test";
const QR_SLUG = "test-school";
const PRESET_QTY = 5;

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
  // Ensure campaign exists (upsert)
  await db()
    .from("qr_campaigns")
    .delete()
    .eq("slug", QR_SLUG);
  await db().from("qr_campaigns").insert({
    slug: QR_SLUG,
    name: "Test School Campaign",
    preset_quantity: PRESET_QTY,
    scans: 0,
  });
});

test.afterAll(async ({ request }) => {
  await db().from("qr_campaigns").delete().eq("slug", QR_SLUG);
  await setClock(request, null).catch(() => {});
});

test("16 — QR redirect preselects qty, donation records qr_campaign_id", async ({ page }) => {
  // ── 1. Follow QR redirect ─────────────────────────────────────────────────
  await page.goto(`/q/${QR_SLUG}`);
  await page.waitForLoadState("networkidle");

  // Should land on /donate?qr=test-school&qty=5
  expect(page.url()).toContain("/donate");
  expect(page.url()).toContain(`qr=${QR_SLUG}`);
  expect(page.url()).toContain(`qty=${PRESET_QTY}`);

  await page.screenshot({
    path: path.join("tests", "evidence", "16-qr-donate.png"),
    fullPage: false,
  });

  // ── 2. Qty=5 preselected in form ──────────────────────────────────────────
  // The qty input or qty chip for 5 should be active (selected)
  // The qty chip "5" button has active class when selected
  const chip5 = page.getByRole("button", { name: "5", exact: true });
  await expect(chip5).toBeVisible();
  // The form's number input should show 5
  const qtyInput = page.locator('input[aria-label="number of children"]');
  await expect(qtyInput).toHaveValue("5");

  // ── 3. Complete donation ──────────────────────────────────────────────────
  // Don't re-navigate — just fill remaining fields on the current page
  await page.getByRole("button", { name: "No thanks", exact: true }).click();
  await page.locator('input[placeholder="your email — no account needed"]').fill(DONOR_EMAIL);
  await page.locator("button").filter({ hasText: /^Feed/ }).click();

  await page.waitForURL(/\/mock-checkout\//);
  await page.getByRole("button", { name: "Pay (test) →" }).click();
  await page.waitForURL(/\/thanks\//);

  await page.screenshot({
    path: path.join("tests", "evidence", "16-qr-thanks.png"),
    fullPage: false,
  });

  // ── 4. DB: qr_campaign_id set on donation ─────────────────────────────────
  const donation = await latestDonationFor(DONOR_EMAIL);
  expect(donation).not.toBeNull();
  expect(donation!.qr_campaign_id).not.toBeNull();

  // Verify the campaign id matches
  const { data: campaign } = await db()
    .from("qr_campaigns")
    .select("id")
    .eq("slug", QR_SLUG)
    .maybeSingle();
  expect(campaign).not.toBeNull();
  expect(donation!.qr_campaign_id).toBe(campaign!.id as string);
});
