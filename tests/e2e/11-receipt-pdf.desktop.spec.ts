/**
 * 11 — Receipt PDF endpoint access control.
 *
 * Unauthenticated request to GET /api/receipts/{number}/pdf must return 401.
 * (Full admin PDF download requires auth flow — see comment below.)
 *
 * NOTE: Testing the full admin-authenticated PDF download is intentionally
 * skipped here because it requires a stored admin session (storageState fixture),
 * which adds significant setup complexity. The auth guard (401 for anonymous)
 * is the load-bearing assertion for Day 1 correctness.
 *
 * To add full PDF verification: create tests/e2e/fixtures.ts with an admin
 * storageState from a prior login, then re-request with that context and assert
 * content-type: application/pdf.
 */

import { test, expect } from "@playwright/test";
import { db, latestDonationFor, setClock } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test11@feedsomeone.test";

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("11 — receipt PDF: 401 for unauthenticated request", async ({ page, request }) => {
  // First create a donation to get a real receipt number
  const donationId = await donateViaMock(page, {
    qty: 1,
    email: DONOR_EMAIL,
    tipPercent: 0,
  });

  await page.screenshot({
    path: path.join("tests", "evidence", "11-thanks.png"),
    fullPage: false,
  });

  // Get the receipt number from DB
  const { data: receipt } = await db()
    .from("receipts")
    .select("number")
    .eq("donation_id", donationId)
    .maybeSingle();
  expect(receipt).not.toBeNull();
  const receiptNumber = receipt!.number as string;
  expect(receiptNumber).toMatch(/^FS-\d{8}-\d{4}$/);

  // Unauthenticated request must return 401
  const res = await request.get(`/api/receipts/${receiptNumber}/pdf`);
  expect(res.status()).toBe(401);
});
