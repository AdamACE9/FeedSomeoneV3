import { adminDb } from "@/lib/supabase/server";

/** Live impact counter snapshot — Realtime broadcast rides on top client-side. */
export async function GET(): Promise<Response> {
  const { data, error } = await adminDb().rpc("get_public_stats");
  if (error) return Response.json({ error: "stats unavailable" }, { status: 500 });
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}
