/**
 * 19 — Engine invariants (pure DB assertions).
 *
 * A) One-photo-one-donor: attempting to insert a duplicate photo_assignment
 *    for the same photo_id must raise error code 23505 (unique violation).
 *
 * B) Sequential receipts: two fresh donations on the same IST day must produce
 *    receipt numbers that differ by exactly 1 in the sequential part,
 *    both matching FS-YYYYMMDD-NNNN prefix.
 */

import { test, expect } from "@playwright/test";
import { db, setClock } from "../helpers/db";
import { donateViaMock } from "../helpers/flows";
import * as path from "node:path";

const DONOR_A = "test19a@feedsomeone.test";
const DONOR_B = "test19b@feedsomeone.test";

test.beforeAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test.afterAll(async ({ request }) => {
  await setClock(request, null).catch(() => {});
});

test("19-A — duplicate photo_assignment violates unique constraint (23505)", async () => {
  // Use a seed pool photo ID that is currently available or assigned
  // We just need any existing photo ID for the constraint test
  // Use the first seed pool photo
  const photoId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01";

  // First, ensure we have a donation_day to reference
  // Insert a minimal donor (test-only)
  // Upsert so a donor left over from a prior run doesn't break the insert path.
  const { data: donor } = await db()
    .from("donors")
    .upsert({ email: "test19-constraint@feedsomeone.test", currency: "INR" }, { onConflict: "email" })
    .select("id")
    .single();
  expect(donor).not.toBeNull();

  // Create a minimal donation + day for referencing
  const { data: donation } = await db()
    .from("donations")
    .insert({
      donor_id: donor!.id,
      type: "one_time",
      status: "paid",
      quantity_total: 1,
      days: 1,
      per_day_quantity: 1,
      currency: "INR",
      amount_local: 2500,
      amount_inr: 2500,
      donor_tz: "Asia/Kolkata",
      provider: "mock",
      provider_session_id: `test19_${Date.now()}`,
    })
    .select("id")
    .maybeSingle();
  expect(donation).not.toBeNull();

  const { data: day } = await db()
    .from("donation_days")
    .insert({
      donation_id: donation!.id,
      day_index: 1,
      quantity: 1,
      status: "assigned",
    })
    .select("id")
    .maybeSingle();
  expect(day).not.toBeNull();

  // Deterministic: use the known seed pool photo; clear any prior assignment and
  // free it so the uniqueness constraint always gets exercised (no pool-empty skip).
  await db().from("photo_assignments").delete().eq("photo_id", photoId);
  await db().from("photos").update({ status: "assigned" }).eq("id", photoId);
  const availPhoto = { id: photoId };

  const { error: firstErr } = await db().from("photo_assignments").insert({
    photo_id: availPhoto.id,
    donation_day_id: day!.id,
    donor_id: donor!.id,
  });
  // First insert might succeed or fail depending on prior state
  // What matters: the SECOND insert must fail with 23505

  const { error: dupErr } = await db().from("photo_assignments").insert({
    photo_id: availPhoto.id,
    donation_day_id: day!.id,
    donor_id: donor!.id,
  });

  // Second insert must fail with unique violation
  expect(dupErr).not.toBeNull();
  expect(dupErr!.code).toBe("23505");
});

test("19-B — sequential receipts: two donations same IST day differ by 1", async ({ page }) => {
  // Donate as donor A
  const donIdA = await donateViaMock(page, {
    qty: 1,
    email: DONOR_A,
    tipPercent: 0,
  });

  await page.screenshot({
    path: path.join("tests", "evidence", "19-receipt-a.png"),
    fullPage: false,
  });

  // Donate as donor B immediately after (same IST day guaranteed since we're not time-traveling)
  const donIdB = await donateViaMock(page, {
    qty: 1,
    email: DONOR_B,
    tipPercent: 0,
  });

  await page.screenshot({
    path: path.join("tests", "evidence", "19-receipt-b.png"),
    fullPage: false,
  });

  // Fetch both receipts
  const { data: receiptA } = await db()
    .from("receipts")
    .select("number")
    .eq("donation_id", donIdA)
    .maybeSingle();
  const { data: receiptB } = await db()
    .from("receipts")
    .select("number")
    .eq("donation_id", donIdB)
    .maybeSingle();

  expect(receiptA).not.toBeNull();
  expect(receiptB).not.toBeNull();

  const numA = receiptA!.number as string;
  const numB = receiptB!.number as string;

  // Both match FS-YYYYMMDD-NNNN
  expect(numA).toMatch(/^FS-\d{8}-\d{4}$/);
  expect(numB).toMatch(/^FS-\d{8}-\d{4}$/);

  // Same date prefix
  const dateA = numA.slice(3, 11); // "YYYYMMDD"
  const dateB = numB.slice(3, 11);
  expect(dateA).toBe(dateB);

  // Sequential counters differ by 1
  const seqA = parseInt(numA.slice(12), 10); // "NNNN"
  const seqB = parseInt(numB.slice(12), 10);
  expect(seqB - seqA).toBe(1);
});
