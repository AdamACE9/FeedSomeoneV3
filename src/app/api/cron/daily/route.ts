import { adminDb } from "@/lib/supabase/server";
import { now } from "@/lib/clock";
import { addCadence, handleCyclePaid } from "@/lib/donation-flow";
import { sendEmail } from "@/lib/email";
import { anniversaryEmail } from "@/lib/email/render";
import { dayKeyInTz, partsInTz } from "@/lib/timewindow";
import { fmtTaken } from "@/lib/deliver";
import type { Cadence } from "@/lib/payments/types";

/**
 * Daily worker: (1) mock-subscription renewals (Stripe bills its own),
 * (2) anniversary emails — exactly one year after the first donation, donor-tz.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const db = adminDb();
  const t = await now();

  // ── mock renewals ────────────────────────────────────────────────────────
  let renewals = 0;
  const { data: dueSubs } = await db
    .from("subscriptions")
    .select("id, provider_sub_id, cadence, next_charge_at")
    .eq("provider", "mock")
    .eq("status", "active")
    .not("provider_sub_id", "is", null)
    .lte("next_charge_at", t.toISOString())
    .limit(200);

  for (const sub of dueSubs ?? []) {
    const cycleKey = `mock_inv_${sub.id}_${dayKeyInTz(t, "Asia/Kolkata")}`;
    await handleCyclePaid({
      id: `evt_${cycleKey}`,
      type: "subscription.cycle_paid",
      subscriptionProviderId: sub.provider_sub_id as string,
      cycleKey,
    });
    await db.from("subscriptions")
      .update({ next_charge_at: addCadence(new Date(sub.next_charge_at as string), sub.cadence as Cadence).toISOString() })
      .eq("id", sub.id);
    renewals++;
  }

  // ── anniversaries ────────────────────────────────────────────────────────
  let anniversaries = 0;
  const windowStart = new Date(t.getTime() - 370 * 24 * 3600_000).toISOString();
  const windowEnd = new Date(t.getTime() - 360 * 24 * 3600_000).toISOString();
  const { data: candidates } = await db
    .from("donors")
    .select("id, email, first_name, tz, first_donation_at")
    .gte("first_donation_at", windowStart)
    .lte("first_donation_at", windowEnd);

  for (const donor of candidates ?? []) {
    const tz = (donor.tz as string) || "Asia/Kolkata";
    const today = partsInTz(t, tz);
    const firstDay = partsInTz(new Date(donor.first_donation_at as string), tz);
    const isAnniversary = firstDay.y === today.y - 1 && firstDay.m === today.m && firstDay.d === today.d;
    if (!isAnniversary) continue;

    // once only
    const { count } = await db.from("email_outbox")
      .select("id", { count: "exact", head: true })
      .eq("kind", "anniversary").eq("ref_id", donor.id);
    if ((count ?? 0) > 0) continue;

    // re-attach the very first delivered photo
    const { data: firstAssign } = await db
      .from("photo_assignments")
      .select("photos(storage_path, blurred_path, taken_at, tz)")
      .eq("donor_id", donor.id)
      .order("assigned_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const ph = (firstAssign?.photos ?? null) as unknown as
      { storage_path: string; blurred_path: string | null; taken_at: string; tz: string } | null;
    let photoUrl: string | null = null;
    let takenLabel: string | null = null;
    if (ph) {
      const { data: signed } = await db.storage.from("photos").createSignedUrl(ph.blurred_path ?? ph.storage_path, 7 * 24 * 3600);
      photoUrl = signed?.signedUrl ?? null;
      takenLabel = fmtTaken(new Date(ph.taken_at), ph.tz);
    }

    const { data: meals } = await db.from("donations").select("quantity_total").eq("donor_id", donor.id).eq("status", "paid");
    const total = (meals ?? []).reduce((s, m) => s + (m.quantity_total as number), 0);

    const mail = anniversaryEmail({
      firstName: (donor.first_name as string | null) ?? null,
      photoUrl, takenLabel, totalMealsSince: total,
    });
    await sendEmail({ to: donor.email as string, subject: mail.subject, html: mail.html, kind: "anniversary", refId: donor.id as string });
    anniversaries++;
  }

  return Response.json({ at: t.toISOString(), renewals, anniversaries });
}
