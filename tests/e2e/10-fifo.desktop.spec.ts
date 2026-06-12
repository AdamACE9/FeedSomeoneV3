/**
 * 10 — FIFO photo assignment proof.
 *
 * After resetAppState the 8 seed pool photos have staggered taken_at.
 * Donating qty 2 should assign exactly the 2 oldest available photos.
 */

import { test, expect } from "@playwright/test";
import { db, resetAppState, setClock } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test10@feedsomeone.test";

test.beforeAll(async ({ request }) => {
  await resetAppState();
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("10 — FIFO: donation qty 2 assigns the 2 oldest available photos", async ({ page }) => {
  // Get the 2 oldest available photos BEFORE donating
  const { data: before } = await db()
    .from("photos")
    .select("id, taken_at")
    .eq("status", "available")
    .order("taken_at", { ascending: true })
    .limit(2);
  expect(before?.length).toBe(2);
  const expectedIds = new Set([before![0].id as string, before![1].id as string]);

  // Donate qty 2
  const donationId = await donateViaMock(page, {
    qty: 2,
    email: DONOR_EMAIL,
    tipPercent: 0,
  });

  await page.screenshot({
    path: path.join("tests", "evidence", "10-fifo-thanks.png"),
    fullPage: false,
  });

  // Get the assigned photos for this donation
  const { data: assignments } = await db()
    .from("photo_assignments")
    .select("photo_id, donation_days!inner(donation_id)")
    .eq("donation_days.donation_id", donationId);

  expect(assignments?.length).toBe(2);

  const assignedIds = new Set(assignments!.map((a) => a.photo_id as string));

  // The assigned IDs must be exactly the 2 oldest
  for (const id of assignedIds) {
    expect(expectedIds.has(id)).toBe(true);
  }
  for (const id of expectedIds) {
    expect(assignedIds.has(id)).toBe(true);
  }
});
