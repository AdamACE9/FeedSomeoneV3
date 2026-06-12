/**
 * Shared UI flow helpers for FeedSomeone E2E tests.
 *
 * donateViaMock() drives the full donate → mock-checkout → thanks flow using
 * REAL selectors / text from the production UI files.
 *
 * Selectors derived from:
 *   src/components/checkout/DonateForm.tsx
 *   src/app/mock-checkout/[sessionId]/page.tsx
 *   src/app/(site)/donate/page.tsx
 */

import { expect, type Page } from "@playwright/test";

export interface DonateOptions {
  qty: number;
  email: string;
  firstName?: string;
  /** tip percent (0 = "No thanks", 25 = "+25%", etc.) — default leaves the 25% pre-selected */
  tipPercent?: number | "default";
  /** "days" mode: number of days to streak */
  scheduleDays?: number;
  /** "recurring" mode */
  recurringCadence?: "Daily" | "Weekly" | "Monthly";
  gift?: { recipientName: string; recipientEmail: string; message?: string };
  dedication?: { kind: "memory" | "honor"; name: string };
}

/**
 * Full mock-payment flow.
 * Returns the donationId parsed from the /thanks/{id} URL.
 */
export async function donateViaMock(page: Page, opts: DonateOptions): Promise<string> {
  await page.goto("/donate");
  await page.waitForLoadState("networkidle");

  // ── Quantity ───────────────────────────────────────────────────────────────
  // QTY_CHIPS = [1, 5, 10, 30]; each is a <button> whose text = the number.
  const qtyChip = page.locator("button").filter({ hasText: new RegExp(`^${opts.qty}$`) }).first();
  if (await qtyChip.isVisible()) {
    await qtyChip.click();
  } else {
    // Use the number input for non-chip quantities
    const input = page.locator('input[aria-label="number of children"]');
    await input.fill(String(opts.qty));
  }

  // ── Schedule (daily streak) ────────────────────────────────────────────────
  if (opts.scheduleDays !== undefined) {
    // Click "Daily streak" frequency button
    await page.getByRole("button", { name: "Daily streak" }).click();
    // Click the "{N} days" chip — DAY_CHIPS = [3, 7, 14, 30]
    await page.getByRole("button", { name: `${opts.scheduleDays} days` }).click();
  }

  // ── Recurring ─────────────────────────────────────────────────────────────
  if (opts.recurringCadence !== undefined) {
    await page.getByRole("button", { name: "Ongoing" }).click();
    // cadence buttons: "Daily" "Weekly" "Monthly"
    await page.getByRole("button", { name: opts.recurringCadence, exact: true }).click();
  }

  // ── Dedication ────────────────────────────────────────────────────────────
  if (opts.dedication) {
    // The toggle button contains "Dedicate this meal" / "Dedicate these meals"
    await page.getByRole("button", { name: /Dedicate/ }).click();
    // Select the kind
    await page.locator('select[aria-label="dedication type"]').selectOption(
      opts.dedication.kind === "memory" ? "In memory of" : "In honor of",
    );
    await page.locator('input[placeholder="their name"]').fill(opts.dedication.name);
  }

  // ── Gift ─────────────────────────────────────────────────────────────────
  if (opts.gift) {
    await page.getByRole("button", { name: "This is a gift" }).click();
    await page.locator('input[placeholder="recipient\'s name"]').fill(opts.gift.recipientName);
    await page.locator('input[placeholder="recipient\'s email"]').fill(opts.gift.recipientEmail);
    if (opts.gift.message) {
      await page.locator('textarea[placeholder="a line from you (optional)"]').fill(opts.gift.message);
    }
  }

  // ── Tip ───────────────────────────────────────────────────────────────────
  if (opts.tipPercent !== undefined && opts.tipPercent !== "default") {
    const label = opts.tipPercent === 0 ? "No thanks" : `+${opts.tipPercent}%`;
    await page.getByRole("button", { name: label, exact: true }).click();
  }

  // ── Contact details ────────────────────────────────────────────────────────
  // placeholder: "your email — no account needed"
  await page.locator('input[placeholder="your email — no account needed"]').fill(opts.email);
  if (opts.firstName) {
    // placeholder contains "first name"
    await page
      .locator("input")
      .filter({ hasText: /first name/ })
      .first()
      // use fill on placeholder match
      .or(page.locator('input[placeholder*="first name"]'))
      .first()
      .fill(opts.firstName);
  }

  // ── Pay button ────────────────────────────────────────────────────────────
  // Text: "Feed one child · ₹25 →" or "Feed {N} children · {amount} →"
  // Starts with "Feed" in all cases
  await page.locator("button").filter({ hasText: /^Feed/ }).click();

  // ── Mock checkout ─────────────────────────────────────────────────────────
  await page.waitForURL(/\/mock-checkout\//);
  await expect(page.getByRole("button", { name: "Pay (test) →" })).toBeVisible();
  await page.getByRole("button", { name: "Pay (test) →" }).click();

  // ── Thanks page ────────────────────────────────────────────────────────────
  await page.waitForURL(/\/thanks\//);

  const url = page.url();
  const match = url.match(/\/thanks\/([^/?#]+)/);
  if (!match) throw new Error(`donateViaMock: could not parse donationId from URL: ${url}`);
  return match[1];
}

/**
 * Tiny valid JPEG (1×1 red pixel) as a Buffer.
 * Embedded as base64 so tests don't need sharp or a file dependency.
 */
export function tinyJpegBuffer(): Buffer {
  // 1×1 red pixel JPEG, minimal valid JFIF
  const B64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U" +
    "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN" +
    "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy" +
    "MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIhAAAQQB" +
    "BAMAAAAAAAAAAAAAAQACAxEEBSExQf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAA" +
    "AAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Aq3lxlKpQyZ+lPaHSOQSSSSTQBLajdCiiig//2Q==";
  return Buffer.from(B64, "base64");
}
