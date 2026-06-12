/**
 * 15 — Admin portal: login, forced password change, dashboard stat cards, nav.
 * MOBILE viewport (390×844, hasTouch).
 *
 * Admin seed has must_change_password=true.
 * After first login, redirected to /admin/password to set new password.
 *
 * Idempotency: if Admin@123 fails (password already changed), fall back to Admin@1234.
 * After test, restore must_change_password=true in DB so re-runs work.
 */

import { test, expect } from "@playwright/test";
import { resetAdminAuth, setClock } from "../helpers/db";
import * as path from "node:path";

const ADMIN_EMAIL = "admin@feedsomeone.com";
const ORIGINAL_PASSWORD = "Admin@123";
const NEW_PASSWORD = "Admin@1234";

test.beforeAll(async ({ request }) => {
  // Deterministic starting point every run: Admin@123 + must_change_password=true.
  await resetAdminAuth();
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("15 — admin login, forced pw change, dashboard stat cards, bottom nav", async ({ page }) => {
  // ── Login with the seeded password ─────────────────────────────────────────
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ORIGINAL_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // must_change_password=true → login lands on the forced-change page. Wait for
  // it to SETTLE there (avoids racing the transient /admin redirect hop).
  await page.waitForURL(/\/admin\/password/, { timeout: 20000 });

  // ── Forced password change ─────────────────────────────────────────────────
  await expect(page.getByText("Set a new password")).toBeVisible();
  await page.screenshot({
    path: path.join("tests", "evidence", "15-admin-pw-change.png"),
    fullPage: false,
  });
  const pwInputs = page.locator('input[type="password"]');
  await pwInputs.first().fill(NEW_PASSWORD);
  await pwInputs.last().fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Set password" }).click();

  // Flag now cleared by adminChangePasswordAction → dashboard.
  await page.waitForURL(/\/admin$/, { timeout: 20000 });

  // ── Dashboard ─────────────────────────────────────────────────────────────
  await expect(page.url()).toMatch(/\/admin/);
  await page.waitForLoadState("networkidle");

  await page.screenshot({
    path: path.join("tests", "evidence", "15-admin-dashboard.png"),
    fullPage: false,
  });

  // Stat cards (from AdminDashboard: "PHOTOS IN POOL", "WAITING DELIVERIES", etc.)
  await expect(page.getByText("PHOTOS IN POOL")).toBeVisible();
  await expect(page.getByText("WAITING DELIVERIES")).toBeVisible();

  // ── Bottom nav (mobile) ────────────────────────────────────────────────────
  // From AdminShell NAV: "Photos", "Donors", "Accounting"
  const photosLink = page.getByRole("link", { name: /Photos/ }).first();
  await expect(photosLink).toBeVisible();

  // Navigate to Photos
  await photosLink.click();
  await page.waitForURL(/\/admin\/photos/);
  await page.waitForLoadState("networkidle");

  await page.screenshot({
    path: path.join("tests", "evidence", "15-admin-photos.png"),
    fullPage: false,
  });

  // Navigate to Donors
  await page.getByRole("link", { name: /Donors/ }).first().click();
  await page.waitForURL(/\/admin\/donors/);
  await page.waitForLoadState("networkidle");

  // Navigate to Accounting
  await page.getByRole("link", { name: /Accounting/ }).first().click();
  await page.waitForURL(/\/admin\/accounting/);
  await page.waitForLoadState("networkidle");

  await page.screenshot({
    path: path.join("tests", "evidence", "15-admin-accounting.png"),
    fullPage: false,
  });

  // Accounting page has Donations and Tips sections
  await expect(page.getByRole("heading", { name: "Donations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tips" })).toBeVisible();
});
