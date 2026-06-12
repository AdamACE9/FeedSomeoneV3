import { adminDb } from "@/lib/supabase/server";
import { now } from "@/lib/clock";
import { sendEmail } from "@/lib/email";
import { photoEmail } from "@/lib/email/render";
import { partsInTz } from "@/lib/timewindow";

/** "1:42 PM" — the wall-clock the photo was taken at, in its own kitchen tz. */
export function fmtTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(instant);
}
/** "1:42 PM · 11 Jun" */
export function fmtTaken(instant: Date, tz: string): string {
  const d = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(instant);
  return `${fmtTime(instant, tz)} · ${d}`;
}

const MAX_ATTEMPTS = 5;
const SIGNED_URL_TTL = 7 * 24 * 3600; // emails live a while — 7-day links

type DeliveryRow = {
  id: string; donation_day_id: string; donor_id: string; recipient_email: string;
  scheduled_at: string | null; status: string; attempt_count: number;
};

/** Sends ONE delivery email (a day's full photo batch). Used by tick + admin force-send. */
export async function sendDelivery(delivery: DeliveryRow, opts: { force?: boolean } = {}): Promise<void> {
  const db = adminDb();

  const { data: day } = await db
    .from("donation_days")
    .select("id, day_index, quantity, donation_id, donations(id, days, donor_id, donor_tz, quantity_total)")
    .eq("id", delivery.donation_day_id)
    .single();
  if (!day) throw new Error(`day missing for delivery ${delivery.id}`);
  const donation = day.donations as unknown as { id: string; days: number; donor_id: string };

  const { data: assignments } = await db
    .from("photo_assignments")
    .select("photo_id, photos(id, storage_path, blurred_path, kitchen_note, taken_at, tz, kitchens(name, city))")
    .eq("donation_day_id", day.id);
  const photoRows = (assignments ?? [])
    .map((a) => a.photos as unknown as {
      id: string; storage_path: string; blurred_path: string | null; kitchen_note: string | null;
      taken_at: string; tz: string; kitchens: { name: string; city: string } | null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.taken_at).getTime() - new Date(b.taken_at).getTime());
  if (!photoRows.length) throw new Error(`no photos assigned for delivery ${delivery.id}`);

  const photos = [];
  for (const ph of photoRows) {
    const path = ph.blurred_path ?? ph.storage_path;
    const { data: signed } = await db.storage.from("photos").createSignedUrl(path, SIGNED_URL_TTL);
    photos.push({
      url: signed?.signedUrl ?? "",
      takenLabel: fmtTaken(new Date(ph.taken_at), ph.tz),
      kitchenName: ph.kitchens?.name ?? "Partner kitchen",
      city: ph.kitchens?.city ?? "",
      note: ph.kitchen_note,
    });
  }

  const { data: donor } = await db.from("donors").select("first_name").eq("id", delivery.donor_id).single();
  const { data: streak } = await db.from("streaks").select("current").eq("donor_id", delivery.donor_id).maybeSingle();
  const { data: receipt } = await db.from("receipts").select("number").eq("donation_id", donation.id).maybeSingle();
  const { data: ded } = await db.from("dedications").select("kind, name").eq("donation_id", donation.id).maybeSingle();

  const first = photoRows[0];
  const mail = photoEmail({
    firstName: (donor?.first_name as string | null) ?? null,
    photos,
    dayIndex: day.day_index as number,
    daysTotal: donation.days,
    quantity: day.quantity as number,
    streakDays: streak && (streak.current as number) >= 3 ? (streak.current as number) : null,
    dedication: (ded as { kind: "memory" | "honor"; name: string } | null) ?? null,
    receiptNumber: (receipt?.number as string | null) ?? null,
    firstTimeLabel: fmtTime(new Date(first.taken_at), first.tz),
  });

  try {
    await sendEmail({ to: delivery.recipient_email, subject: mail.subject, html: mail.html, kind: "photo", refId: delivery.id });
  } catch (err) {
    const attempts = delivery.attempt_count + 1;
    await db.from("deliveries").update({
      attempt_count: attempts,
      last_error: err instanceof Error ? err.message : String(err),
      status: attempts >= MAX_ATTEMPTS ? "failed" : delivery.status,
    }).eq("id", delivery.id);
    throw err;
  }

  const sentAt = (await now()).toISOString();
  await db.from("deliveries").update({ status: "sent", sent_at: sentAt, last_error: null }).eq("id", delivery.id);
  await db.from("photos").update({ status: "delivered" }).in("id", photoRows.map((p) => p.id));
  await db.from("donation_days").update({ status: "delivered" }).eq("id", day.id);
  void opts;
}

/** The 60-second worker body: everything due, oldest first. */
export async function sendDueDeliveries(limit = 50): Promise<{ sent: number; failed: number }> {
  const db = adminDb();
  const cutoff = (await now()).toISOString();
  const { data: due } = await db
    .from("deliveries")
    .select("id, donation_day_id, donor_id, recipient_email, scheduled_at, status, attempt_count")
    .eq("status", "scheduled")
    .lte("scheduled_at", cutoff)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  let sent = 0, failed = 0;
  for (const d of (due ?? []) as DeliveryRow[]) {
    try {
      await sendDelivery(d);
      sent++;
    } catch {
      failed++; // attempt bookkeeping already done in sendDelivery
    }
  }
  return { sent, failed };
}
