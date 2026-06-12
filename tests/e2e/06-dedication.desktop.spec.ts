/**
 * 06 — Dedication: "In memory of Nani".
 *
 * Asserts:
 * - /thanks page shows dedication line.
 * - Receipt email HTML contains "In memory of Nani".
 */

import { test, expect } from "@playwright/test";
import { outboxFor, setClock } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test06@feedsomeone.test";

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("06 — memory dedication shown on thanks page and in receipt email", async ({ page }) => {
  await donateViaMock(page, {
    qty: 1,
    email: DONOR_EMAIL,
    tipPercent: 0,
    dedication: { kind: "memory", name: "Nani" },
  });

  // ── /thanks dedication line ───────────────────────────────────────────────
  // From thanks/[donationId]/page.tsx:
  // "In memory of {name} — on the receipt and in every photo email."
  await expect(
    page.getByText(/In memory of Nani/),
  ).toBeVisible();

  await page.screenshot({
    path: path.join("tests", "evidence", "06-dedication-thanks.png"),
    fullPage: false,
  });

  // ── Receipt email contains dedication ─────────────────────────────────────
  const receiptEmails = await outboxFor(DONOR_EMAIL, "receipt");
  expect(receiptEmails.length).toBeGreaterThanOrEqual(1);
  const latestReceipt = receiptEmails[receiptEmails.length - 1];
  expect(latestReceipt.html).toContain("Nani");
});
