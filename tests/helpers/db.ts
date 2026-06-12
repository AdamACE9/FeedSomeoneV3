/**
 * DB helpers for FeedSomeone E2E tests.
 *
 * Uses the Supabase service-role client (bypasses RLS).
 * Env is loaded from .env.local at module init (same pattern as scripts/dev-cron.mjs).
 *
 * IMPORTANT: resetAppState() does NOT shell out to `supabase db reset` (too slow for per-test).
 * Instead it surgically deletes and restores mutable rows, preserving the 2 seed demo donors
 * and the 12 seed photos (8 available + 4 delivered) by their fixed UUIDs from seed.sql.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { APIRequestContext, Page } from "@playwright/test";

// ── env loading (mirrors dev-cron.mjs) ───────────────────────────────────────

function loadEnv(file: string): void {
  try {
    const text = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* file absent — fine */
  }
}

loadEnv(".env.local");
loadEnv(".env");

// ── client singleton ──────────────────────────────────────────────────────────

function getClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "DB helpers: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

let _client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!_client) _client = getClient();
  return _client;
}

// ── Fixed seed UUIDs (from supabase/seed.sql) ─────────────────────────────────

export const SEED = {
  DONOR_AYESHA: "44444444-4444-4444-4444-444444444444",
  DONOR_ROHAN: "55555555-5555-5555-5555-555555555555",
  KITCHEN_NOOR: "33333333-3333-3333-3333-333333333333",
  USER_ADMIN: "11111111-1111-1111-1111-111111111111",
  USER_KITCHEN: "22222222-2222-2222-2222-222222222222",
  /** 8 pool photos — available at seed time */
  POOL_PHOTO_IDS: [
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa06",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa07",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa08",
  ],
  /** 4 delivered photos — status must stay 'delivered' */
  DELIVERED_PHOTO_IDS: [
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa09",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11",
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12",
  ],
  DONATION_1: "66666666-6666-6666-6666-666666666601",
  DONATION_2: "66666666-6666-6666-6666-666666666602",
  DAY_1: "77777777-7777-7777-7777-777777777701",
  DAY_2: "77777777-7777-7777-7777-777777777702",
  DELIVERY_1: "88888888-8888-8888-8888-888888888801",
  DELIVERY_2: "88888888-8888-8888-8888-888888888802",
} as const;

const ALL_SEED_DONOR_IDS = [SEED.DONOR_AYESHA, SEED.DONOR_ROHAN] as const;
const ALL_SEED_PHOTO_IDS = [...SEED.POOL_PHOTO_IDS, ...SEED.DELIVERED_PHOTO_IDS] as const;

// ── Public query helpers ──────────────────────────────────────────────────────

/** All email_outbox rows for a recipient, optionally filtered by kind. */
export async function outboxFor(
  email: string,
  kind?: string,
): Promise<Array<{ id: string; subject: string; html: string; kind: string; created_at: string }>> {
  let q = db()
    .from("email_outbox")
    .select("id, subject, html, kind, created_at")
    .eq("to_email", email)
    .order("created_at", { ascending: true });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw new Error(`outboxFor: ${error.message}`);
  return (data ?? []) as Array<{ id: string; subject: string; html: string; kind: string; created_at: string }>;
}

/** Latest paid donation for a donor email. */
export async function latestDonationFor(email: string): Promise<Record<string, unknown> | null> {
  const { data: donor } = await db()
    .from("donors")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!donor) return null;

  const { data, error } = await db()
    .from("donations")
    .select("*")
    .eq("donor_id", donor.id as string)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`latestDonationFor: ${error.message}`);
  return data as Record<string, unknown> | null;
}

/** All deliveries for a donation (all days). */
export async function deliveriesFor(
  donationId: string,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await db()
    .from("deliveries")
    .select("*, donation_days!inner(donation_id)")
    .eq("donation_days.donation_id", donationId)
    .order("donation_days(day_index)", { ascending: true });
  if (error) throw new Error(`deliveriesFor: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** All photos with a given status. */
export async function photosByStatus(
  status: "available" | "assigned" | "delivered" | "flagged" | "rejected",
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await db()
    .from("photos")
    .select("id, status, taken_at, kitchen_id")
    .eq("status", status);
  if (error) throw new Error(`photosByStatus: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

// ── Time travel helpers ───────────────────────────────────────────────────────

/**
 * Set (or clear) the clock override via the test API.
 * Works with both Page and APIRequestContext so callers can choose.
 */
export async function setClock(
  requester: Page | APIRequestContext,
  iso: string | null,
): Promise<void> {
  const isPage = "goto" in requester;
  if (isPage) {
    const page = requester as Page;
    const res = await page.request.post("/api/test/clock", {
      data: { iso },
      headers: { "content-type": "application/json" },
    });
    if (!res.ok()) {
      throw new Error(`setClock (page): HTTP ${res.status()} — ${await res.text()}`);
    }
  } else {
    const request = requester as APIRequestContext;
    const res = await request.post("/api/test/clock", {
      data: { iso },
      headers: { "content-type": "application/json" },
    });
    if (!res.ok()) {
      throw new Error(`setClock (request): HTTP ${res.status()} — ${await res.text()}`);
    }
  }
}

/**
 * POST /api/cron/tick with Bearer CRON_SECRET.
 * Pass { retry: true } to append ?retry=1 so assign_photos runs regardless of minute parity.
 */
export async function tick(
  request: APIRequestContext,
  options: { retry?: boolean } = {},
): Promise<Record<string, unknown>> {
  const secret = process.env.CRON_SECRET ?? "";
  const url = options.retry ? "/api/cron/tick?retry=1" : "/api/cron/tick";
  const res = await request.post(url, {
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!res.ok()) {
    throw new Error(`tick: HTTP ${res.status()} — ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * POST /api/cron/daily with Bearer CRON_SECRET.
 */
export async function daily(request: APIRequestContext): Promise<Record<string, unknown>> {
  const secret = process.env.CRON_SECRET ?? "";
  const res = await request.post("/api/cron/daily", {
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!res.ok()) {
    throw new Error(`daily: HTTP ${res.status()} — ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// ── State reset ───────────────────────────────────────────────────────────────

/**
 * Reset mutable DB state WITHOUT a full `supabase db reset`.
 *
 * Deletes all rows from transient tables in FK-safe order, then
 * restores the 8 seed pool photos to status='available'.
 * Keeps: 2 seed donors, 12 seed photos (including the 4 'delivered'),
 *        countries, kitchens, profiles, auth.users, app_settings (except clock_override).
 */
export async function resetAppState(): Promise<void> {
  const d = db();

  // 1. FK leaves first — deepest dependants
  await d.from("photo_assignments").delete().neq("photo_id", "00000000-0000-0000-0000-000000000000"); // delete all
  await d.from("deliveries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await d.from("donation_days").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 2. Money tables
  await d.from("tips").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await d.from("receipts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await d.from("dedications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await d.from("gifts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await d.from("subscriptions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await d.from("donations").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 3. Misc
  await d.from("webhook_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await d.from("email_outbox").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await d.from("receipt_counters").delete().neq("date_key", "__never__");
  await d.from("streaks").delete().neq("donor_id", "00000000-0000-0000-0000-000000000000");
  await d.from("qr_campaigns").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // 4. Donors: keep only the 2 seed donors
  await d
    .from("donors")
    .delete()
    .not("id", "in", `(${ALL_SEED_DONOR_IDS.join(",")})`);

  // 5. Photos: delete non-seed rows
  await d
    .from("photos")
    .delete()
    .not("id", "in", `(${ALL_SEED_PHOTO_IDS.join(",")})`);

  // 6. Restore the 8 pool photos to 'available'
  await d
    .from("photos")
    .update({ status: "available" })
    .in("id", SEED.POOL_PHOTO_IDS);

  // 7. Restore the 4 delivered seed photos to 'delivered' (in case any test changed them)
  await d
    .from("photos")
    .update({ status: "delivered" })
    .in("id", SEED.DELIVERED_PHOTO_IDS);

  // 8. Clear clock override
  await d
    .from("app_settings")
    .upsert({ key: "clock_override", value: null });
}
