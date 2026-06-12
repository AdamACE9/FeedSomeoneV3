import { adminDb } from "@/lib/supabase/server";
import { fmtTime } from "@/lib/deliver";

/** Thanks-page poller. Donation UUIDs are unguessable; payload is minimal. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const db = adminDb();
  const { data: d } = await db
    .from("donations")
    .select("id, status, days, donor_tz")
    .eq("id", id)
    .maybeSingle();
  if (!d) return new Response("not found", { status: 404 });

  const { data: receipt } = await db.from("receipts").select("number").eq("donation_id", id).maybeSingle();
  const { data: days } = await db
    .from("donation_days")
    .select("day_index, status, deliveries(status, scheduled_at, sent_at)")
    .eq("donation_id", id)
    .order("day_index", { ascending: true })
    .limit(1);

  const first = days?.[0];
  const delivery = (first?.deliveries as unknown as { status: string; scheduled_at: string | null } | null) ?? null;
  let scheduledLabel: string | null = null;
  if (delivery?.scheduled_at) {
    const at = new Date(delivery.scheduled_at);
    const dayKeyNow = new Intl.DateTimeFormat("en-CA", { timeZone: d.donor_tz as string }).format(new Date());
    const dayKeyAt = new Intl.DateTimeFormat("en-CA", { timeZone: d.donor_tz as string }).format(at);
    scheduledLabel = `${fmtTime(at, d.donor_tz as string)} ${dayKeyAt === dayKeyNow ? "today" : "tomorrow"}`;
  }

  return Response.json(
    {
      status: d.status,
      receipt: receipt?.number ?? null,
      delivery: delivery ? { status: delivery.status, scheduledLabel } : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
