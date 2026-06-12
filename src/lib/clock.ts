import { adminDb } from "@/lib/supabase/server";

/**
 * Single source of "now". In TEST_MODE=1 the E2E suite can freeze/advance time by
 * writing app_settings.clock_override (ISO string) — photo delivery, streaks and
 * anniversary tests time-travel without waiting. In normal mode this is just Date.
 */

let cache: { at: number; value: Date | null } | null = null;

export async function now(): Promise<Date> {
  if (process.env.TEST_MODE !== "1") return new Date();
  const fresh = cache && Date.now() - cache.at < 2000;
  if (!fresh) {
    const { data } = await adminDb().from("app_settings").select("value").eq("key", "clock_override").maybeSingle();
    const v = data?.value;
    cache = { at: Date.now(), value: typeof v === "string" && v ? new Date(v) : null };
  }
  return cache!.value ?? new Date();
}

/** Test helper (route /api/test/clock uses it). */
export async function setClockOverride(iso: string | null): Promise<void> {
  // app_settings.value is `jsonb NOT NULL`, so we CANNOT upsert a null value to
  // clear the override (it silently violates the constraint and the old value —
  // e.g. a far-future test date — leaks into every later request). Delete to clear.
  if (iso === null) {
    await adminDb().from("app_settings").delete().eq("key", "clock_override");
  } else {
    await adminDb().from("app_settings").upsert({ key: "clock_override", value: iso });
  }
  cache = null;
}
