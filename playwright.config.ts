import { defineConfig } from "@playwright/test";

/**
 * FeedSomeone E2E suite.
 *
 * - workers: 1   — tests share one DB; serial execution keeps state sane.
 * - timeout: 60s per test.
 * - retries: 0   — failures are real; don't hide flakiness.
 * - Two projects: "desktop" (runs e2e/*.desktop.spec.ts + e2e/*.spec.ts) and
 *   "mobile"  (runs e2e/*.mobile.spec.ts only).
 *
 * webServer: starts Next.js dev server only once (reuseExistingServer).
 * TEST_MODE=1 enables /api/test/clock time-travel.
 * MOCK_AUTOCONFIRM=0 so the mock-checkout page is shown (tests click it explicitly).
 */

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // The dev machine is in Asia/Dubai, so the donate form's client-side currency
    // detection (tzCurrencyHint) resolves to AED, whose Stripe minimum is 2 — which
    // blocks every qty-1 test and changes amounts. Pin to Asia/Kolkata so the suite
    // runs as an INR donor (the ₹25 base the specs assume). Spec 18 overrides this.
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
  },

  projects: [
    {
      name: "desktop",
      // Exclude *.mobile.spec.ts from the desktop project
      testMatch: /.*\.desktop\.spec\.ts$/,
      // plain bundled Chromium — no branded-Chrome channel, no WebKit
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      // Only *.mobile.spec.ts in the mobile project
      testMatch: /.*\.mobile\.spec\.ts$/,
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      TEST_MODE: "1",
      MOCK_AUTOCONFIRM: "0",
    },
  },
});
