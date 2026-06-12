import { adminDb } from "@/lib/supabase/server";
import { now } from "@/lib/clock";
import { addDaysToKey, dayKeyInTz, nextOccurrence, wallClockInTz } from "@/lib/timewindow";

/**
 * The delivery engine (plan §5, locked rules §❷.5):
 *  - "N children × D days" ⇒ D donation_days ⇒ D emails of N photos each.
 *  - Day k becomes eligible on (paid date in IST) + k−1 — photos are from that day's pool.
 *  - FIFO oldest-first by country via assign_photos() (FOR UPDATE SKIP LOCKED).
 *  - A day's email is scheduled only when its batch is COMPLETE; the scheduled
 *    time = earliest photo's kitchen wall-clock re-rendered in the donor's tz
 *    (already passed today ⇒ tomorrow).
 *  - Empty pool ⇒ delivery stays 'waiting'; the 5-minute retry tops it up.
 * Everything here is idempotent — webhook retries and cron overlaps are safe.
 */

const ENGINE_TZ = "Asia/Kolkata"; // kitchens are India-first; day-eligibility anchors here

type DonationCore = {
  id: string;
  donor_id: string;
  status: string;
  days: number;
  per_day_quantity: number;
  country_pref: string | null;
  donor_tz: string;
  paid_at: string | null;
};

export async function processPaidDonation(donationId: string): Promise<void> {
  const db = adminDb();
  const { data: donation, error } = await db
    .from("donations")
    .select("id, donor_id, status, days, per_day_quantity, country_pref, donor_tz, paid_at")
    .eq("id", donationId)
    .single();
  if (error) throw error;
  if (!donation || donation.status !== "paid") return;

  const { data: donor } = await db.from("donors").select("email").eq("id", donation.donor_id).single();
  const { data: gift } = await db.from("gifts").select("recipient_email").eq("donation_id", donationId).maybeSingle();
  const recipient = (gift?.recipient_email as string | undefined) ?? (donor?.email as string);

  // ensure D day rows
  const dayRows = Array.from({ length: donation.days }, (_, i) => ({
    donation_id: donation.id,
    day_index: i + 1,
    quantity: donation.per_day_quantity,
  }));
  await db.from("donation_days").upsert(dayRows, { onConflict: "donation_id,day_index", ignoreDuplicates: true });

  // ensure a delivery shell per day (recipient locked in now; donor portal shows states)
  const { data: days } = await db
    .from("donation_days")
    .select("id, day_index, quantity, status")
    .eq("donation_id", donation.id);
  if (days?.length) {
    await db.from("deliveries").upsert(
      days.map((d) => ({ donation_day_id: d.id, donor_id: donation.donor_id, recipient_email: recipient })),
      { onConflict: "donation_day_id", ignoreDuplicates: true },
    );
  }

  await assignEligibleDays(donation as DonationCore);
}

export async function assignEligibleDays(donation: DonationCore): Promise<void> {
  if (!donation.paid_at) return;
  const db = adminDb();
  const today = dayKeyInTz(await now(), ENGINE_TZ);
  const paidKey = dayKeyInTz(new Date(donation.paid_at), ENGINE_TZ);

  const { data: days } = await db
    .from("donation_days")
    .select("id, day_index, quantity, status")
    .eq("donation_id", donation.id)
    .in("status", ["unassigned", "partial"])
    .order("day_index", { ascending: true });

  for (const day of days ?? []) {
    const eligibleKey = addDaysToKey(paidKey, day.day_index - 1);
    if (eligibleKey > today) break; // future days wait for their calendar day
    await attemptDayAssignment(donation, day as { id: string; quantity: number });
  }
}

export async function attemptDayAssignment(
  donation: Pick<DonationCore, "id" | "donor_id" | "country_pref" | "donor_tz">,
  day: { id: string; quantity: number },
): Promise<"assigned" | "partial" | "unassigned"> {
  const db = adminDb();

  const countAssigned = async () => {
    const { count } = await db
      .from("photo_assignments")
      .select("id", { count: "exact", head: true })
      .eq("donation_day_id", day.id);
    return count ?? 0;
  };

  const have = await countAssigned();
  const needed = day.quantity - have;
  if (needed > 0) {
    const { error } = await db.rpc("assign_photos", {
      p_day_id: day.id,
      p_donor: donation.donor_id,
      p_n: needed,
      p_country: donation.country_pref,
    });
    if (error) throw error;
  }

  const total = await countAssigned();
  if (total >= day.quantity) {
    await scheduleDelivery(donation, day.id);
    await db.from("donation_days").update({ status: "assigned" }).eq("id", day.id).neq("status", "delivered");
    return "assigned";
  }
  if (total > 0) {
    await db.from("donation_days").update({ status: "partial" }).eq("id", day.id).in("status", ["unassigned", "partial"]);
    return "partial";
  }
  return "unassigned";
}

async function scheduleDelivery(donation: Pick<DonationCore, "donor_tz">, dayId: string): Promise<void> {
  const db = adminDb();
  const { data: rows } = await db
    .from("photo_assignments")
    .select("photos(taken_at, tz)")
    .eq("donation_day_id", dayId);

  const photos = (rows ?? [])
    .map((r) => r.photos as unknown as { taken_at: string; tz: string } | null)
    .filter((p): p is { taken_at: string; tz: string } => Boolean(p))
    .sort((a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime());
  if (!photos.length) return;

  const earliest = photos[0];
  const wc = wallClockInTz(new Date(earliest.taken_at), earliest.tz);
  const at = nextOccurrence(wc, donation.donor_tz, await now());

  await db
    .from("deliveries")
    .update({ scheduled_at: at.toISOString(), status: "scheduled" })
    .eq("donation_day_id", dayId)
    .eq("status", "waiting");
}

/** 5-minute retry: oldest paid donations first — fairness is FIFO on both sides. */
export async function retryWaitingDays(limit = 200): Promise<number> {
  const db = adminDb();
  const { data: days } = await db
    .from("donation_days")
    .select("id, day_index, quantity, status, donations!inner(id, donor_id, status, country_pref, donor_tz, paid_at)")
    .in("status", ["unassigned", "partial"])
    .eq("donations.status", "paid")
    .limit(limit);

  const today = dayKeyInTz(await now(), ENGINE_TZ);
  const eligible = (days ?? [])
    .map((d) => ({ day: d, donation: d.donations as unknown as DonationCore }))
    .filter(({ day, donation }) => {
      if (!donation.paid_at) return false;
      const eligibleKey = addDaysToKey(dayKeyInTz(new Date(donation.paid_at), ENGINE_TZ), (day.day_index as number) - 1);
      return eligibleKey <= today;
    })
    .sort((a, b) => new Date(a.donation.paid_at!).getTime() - new Date(b.donation.paid_at!).getTime());

  let touched = 0;
  for (const { day, donation } of eligible) {
    const res = await attemptDayAssignment(donation, { id: day.id as string, quantity: day.quantity as number });
    if (res !== "unassigned") touched++;
  }
  return touched;
}
