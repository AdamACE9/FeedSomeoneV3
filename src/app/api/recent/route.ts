import { adminDb } from "@/lib/supabase/server";
import { fmtTime } from "@/lib/deliver";

export const dynamic = "force-dynamic";

/**
 * The most recently delivered meals, for the live "Recently fed" strip.
 * The client polls this; new photos slide in as kitchens serve children.
 */
export async function GET(): Promise<Response> {
  try {
    const db = adminDb();
    const { data } = await db
      .from("photos")
      .select("id, storage_path, blurred_path, taken_at, tz, kitchens(city)")
      .eq("status", "delivered")
      .order("taken_at", { ascending: false })
      .limit(12);

    const out: Array<{ id: string; url: string; city: string; time: string; takenAt: string }> = [];
    for (const p of data ?? []) {
      const path = (p.blurred_path as string | null) ?? (p.storage_path as string);
      const { data: signed } = await db.storage.from("photos").createSignedUrl(path, 3600);
      if (!signed?.signedUrl) continue;
      const takenAt = new Date(p.taken_at as string);
      out.push({
        id: p.id as string,
        url: signed.signedUrl,
        city: (p.kitchens as unknown as { city: string } | null)?.city ?? "New Delhi",
        time: fmtTime(takenAt, p.tz as string),
        takenAt: takenAt.toISOString(),
      });
    }
    return Response.json({ photos: out }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ photos: [] }, { status: 200 });
  }
}
