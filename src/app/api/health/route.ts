import { adminDb } from "@/lib/supabase/server";

/** verify.sh + uptime checks hit this. Names only — never values. */
export async function GET(): Promise<Response> {
  const required = [
    "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY", "PAYMENT_PROVIDER", "EMAIL_PROVIDER", "CRON_SECRET",
  ];
  const missingEnv = required.filter((k) => !process.env[k]);

  let db = false, storage = false;
  try {
    const { error } = await adminDb().from("countries").select("code", { head: true, count: "exact" });
    db = !error;
  } catch { /* down */ }
  try {
    const { data } = await adminDb().storage.listBuckets();
    storage = Boolean(data?.some((b) => b.name === "photos"));
  } catch { /* down */ }

  const ok = missingEnv.length === 0 && db && storage;
  return Response.json({
    ok, db, storage, missingEnv,
    payment_provider: process.env.PAYMENT_PROVIDER ?? "mock",
    email_provider: process.env.EMAIL_PROVIDER ?? "local",
  }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
