/**
 * 17 — Live counter: /api/counter increments after a donation, and the
 * landing-page counter pill eventually reflects the new value.
 *
 * SLOW TEST — marked with tag. The LiveCounter polls every 25s (polling
 * fallback when SSE is unavailable). We wait up to 35s for the pill to update.
 *
 * Strategy:
 * 1. Open landing page, record initial counter value.
 * 2. Complete a mock donation in the SAME browser context (via second tab).
 * 3. Assert /api/counter fed_today is higher.
 * 4. Assert the pill text eventually updates on the already-open landing page.
 */

import { test, expect } from "@playwright/test";
import { setClock } from "../helpers/db";
import * as path from "node:path";

const DONOR_EMAIL = "test17@feedsomeone.test";

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

// Mark this test as slow — it relies on the polling cycle
test("17 — live counter updates after donation [slow]", async ({ page, context }) => {
  test.setTimeout(90_000); // extra time for polling cycle

  // ── 1. Open landing page and read initial counter ─────────────────────────
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  const counterPill = page.locator("span").filter({ hasText: /fed today/ }).first();
  await expect(counterPill).toBeVisible();

  const initialText = await counterPill.textContent();
  const initialCount = parseInt((initialText ?? "0").replace(/[^0-9]/g, ""), 10) || 0;

  // ── 2. /api/counter before donation ──────────────────────────────────────
  const beforeRes = await page.request.get("/api/counter");
  const beforeStats = await beforeRes.json() as { fed_today?: number };
  const beforeFedToday = beforeStats.fed_today ?? 0;

  // ── 3. Complete a donation in a second tab ────────────────────────────────
  const donorPage = await context.newPage();
  await donorPage.goto("/donate");
  await donorPage.waitForLoadState("networkidle");

  await donorPage.getByRole("button", { name: "1", exact: true }).click();
  await donorPage.getByRole("button", { name: "No thanks", exact: true }).click();
  await donorPage.locator('input[placeholder="your email — no account needed"]').fill(DONOR_EMAIL);
  await donorPage.getByRole("button", { name: /Feed .*\u00b7.*\u2192/ }).click();

  await donorPage.waitForURL(/\/mock-checkout\//);
  await donorPage.getByRole("button", { name: "Pay (test) →" }).click();
  await donorPage.waitForURL(/\/thanks\//);
  await donorPage.close();

  await page.screenshot({
    path: path.join("tests", "evidence", "17-counter-after-donation.png"),
    fullPage: false,
  });

  // ── 4. /api/counter after donation should be higher ───────────────────────
  const afterRes = await page.request.get("/api/counter");
  const afterStats = await afterRes.json() as { fed_today?: number };
  expect((afterStats.fed_today ?? 0)).toBeGreaterThan(beforeFedToday);

  // ── 5. Landing page counter eventually updates (polling within 35s) ────────
  // The LiveCounter polls every 25s. Wait up to 35s for the displayed value to change.
  await expect
    .poll(
      async () => {
        const text = (await counterPill.textContent()) ?? "0";
        return parseInt(text.replace(/[^0-9]/g, ""), 10);
      },
      {
        timeout: 35_000,
        intervals: [2_000, 3_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000],
        message: "Live counter did not update within 35 seconds",
      },
    )
    .toBeGreaterThan(initialCount);
});
