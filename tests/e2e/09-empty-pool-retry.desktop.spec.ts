/**
 * 09 — Empty pool retry: LAUNCH-CRITICAL PATH.
 *
 * Steps:
 * 1. resetAppState + set all 8 pool photos to 'rejected'.
 * 2. Donate qty 1 → delivery waiting (no photos available).
 * 3. Insert a fresh 'available' photo via DB.
 * 4. tick(request, { retry: true }) → delivery becomes 'scheduled'.
 */

import { test, expect } from "@playwright/test";
import { db, resetAppState, setClock, tick } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_EMAIL = "test09@feedsomeone.test";

// Seed kitchen UUID (from seed.sql)
const KITCHEN_ID = "33333333-3333-3333-3333-333333333333";

test.beforeAll(async ({ request }) => {
  await resetAppState();
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("09 — empty pool: delivery waiting; insert photo; retry tick promotes to scheduled", async ({
  page,
  request,
}) => {
  // ── 1. Set all seed pool photos to 'rejected' ─────────────────────────────
  const { error: rejectErr } = await db()
    .from("photos")
    .update({ status: "rejected" })
    .eq("status", "available");
  expect(rejectErr).toBeNull();

  // Confirm pool is empty
  const { count } = await db()
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("status", "available");
  expect(count).toBe(0);

  // ── 2. Donate qty 1 ────────────────────────────────────────────────────────
  const donationId = await donateViaMock(page, {
    qty: 1,
    email: DONOR_EMAIL,
    tipPercent: 0,
  });

  await page.screenshot({
    path: path.join("tests", "evidence", "09-empty-pool-thanks.png"),
    fullPage: false,
  });

  // Delivery should be 'waiting' (no photos)
  const { data: days } = await db()
    .from("donation_days")
    .select("id, status")
    .eq("donation_id", donationId)
    .maybeSingle();
  expect(days).not.toBeNull();

  const { data: delivery } = await db()
    .from("deliveries")
    .select("id, status")
    .eq("donation_day_id", days!.id as string)
    .maybeSingle();
  expect(delivery).not.toBeNull();
  expect(delivery!.status).toBe("waiting");

  // ── 3. Insert a fresh available photo ──────────────────────────────────────
  const { data: newPhoto, error: insertErr } = await db()
    .from("photos")
    .insert({
      kitchen_id: KITCHEN_ID,
      country_code: "IN",
      storage_path: "seed/photo-01.jpg", // reuse storage path (different UUID)
      taken_at: new Date().toISOString(),
      tz: "Asia/Kolkata",
      status: "available",
    })
    .select("id")
    .maybeSingle();
  expect(insertErr).toBeNull();
  expect(newPhoto).not.toBeNull();

  // ── 4. tick with retry=1 → assign_photos runs, delivery becomes scheduled ──
  await tick(request, { retry: true });

  // Check delivery is now scheduled
  const { data: updatedDelivery } = await db()
    .from("deliveries")
    .select("status")
    .eq("id", delivery!.id as string)
    .maybeSingle();
  expect(updatedDelivery?.status).toBe("scheduled");
});
