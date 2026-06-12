/**
 * 01 — Landing page smoke: structure, key copy, team names, stats badge.
 * Desktop only. Does not require DB state mutations.
 */

import { test, expect } from "@playwright/test";
import { setClock } from "../helpers/db";
import * as path from "node:path";

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("01 — landing page loads with required sections and copy", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  // ── h1 ──────────────────────────────────────────────────────────────────
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Feed one child");

  // ── counter pill ─────────────────────────────────────────────────────────
  // LiveCounter renders "N children fed today" inside a <span>
  await expect(page.locator("span").filter({ hasText: /fed today/ }).first()).toBeVisible();

  // ── CTA link text ─────────────────────────────────────────────────────────
  // "Feed one child · ₹25 →"  (or USD equivalent but always contains "Feed one child")
  await expect(page.getByRole("link", { name: /Feed one child/ }).first()).toBeVisible();

  // ── Carousel section ─────────────────────────────────────────────────────
  // Either shows real photos or the empty-pool placeholder text
  const carouselSection = page.locator("section").filter({
    hasText: /Recently fed|The first photos arrive when kitchens open/,
  });
  await expect(carouselSection).toBeVisible();

  // ── How-It-Works section ──────────────────────────────────────────────────
  await expect(page.locator("text=HOW IT WORKS")).toBeVisible();
  await expect(page.getByText("Four steps. One real minute.")).toBeVisible();

  // ── Stats band badge ──────────────────────────────────────────────────────
  await expect(
    page.locator("span").filter({ hasText: "100% goes to meals — zero admin fee." }).first(),
  ).toBeVisible();

  // ── Team names ────────────────────────────────────────────────────────────
  await expect(page.getByText("Danish Ahmed").first()).toBeVisible();
  await expect(page.getByText("Adam Ahmed").first()).toBeVisible();

  // ── Screenshot evidence ────────────────────────────────────────────────────
  await page.screenshot({
    path: path.join("tests", "evidence", "01-landing.png"),
    fullPage: false,
  });
});
