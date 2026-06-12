import { adminDb, audit } from "@/lib/supabase/server";
import { now } from "@/lib/clock";
import { sendEmail } from "@/lib/email";
import { receiptEmail, giftNoticeEmail, paymentFailedEmail } from "@/lib/email/render";
import { formatMoney, mealsAmountInr, type Currency } from "@/lib/money";
import { processPaidDonation } from "@/lib/assignment";
import { updateStreakOnPayment } from "@/lib/streaks";
import { allocateReceipt } from "@/lib/receipts";
import type { PaymentEvent, Cadence } from "@/lib/payments/types";

/**
 * Provider-agnostic payment lifecycle. The webhook route (mock OR stripe) and the
 * daily mock-renewal cron both land here. Every step is idempotent — events can
 * replay safely.
 */

export function addCadence(d: Date, cadence: Cadence): Date {
  const out = new Date(d);
  if (cadence === "daily") out.setUTCDate(out.getUTCDate() + 1);
  else if (cadence === "weekly") out.setUTCDate(out.getUTCDate() + 7);
  else out.setUTCMonth(out.getUTCMonth() + 1);
  return out;
}

export async function handleCheckoutCompleted(ev: Extract<PaymentEvent, { type: "checkout.completed" }>): Promise<void> {
  const db = adminDb();
  const paidAt = await now();

  // pending → paid exactly once
  const { data: updated, error } = await db
    .from("donations")
    .update({ status: "paid", paid_at: paidAt.toISOString(), provider_session_id: ev.sessionId })
    .eq("id", ev.donationId)
    .eq("status", "pending")
    .select("id, donor_id, type, quantity_total, days, per_day_quantity, currency, amount_local, donor_tz, subscription_id, is_classroom");
  if (error) throw error;
  if (!updated?.length) return; // replay — already processed
  const donation = updated[0];

  const { data: donor } = await db
    .from("donors").select("id, email, first_name, first_donation_at, tz").eq("id", donation.donor_id).single();
  if (!donor) throw new Error(`donor missing for donation ${donation.id}`);

  if (!donor.first_donation_at) {
    await db.from("donors").update({ first_donation_at: paidAt.toISOString() }).eq("id", donor.id).is("first_donation_at", null);
  }

  await updateStreakOnPayment(donor.id, paidAt, donation.donor_tz);
  const receiptNumber = await allocateReceipt(donation.id);

  // activate subscription (stripe: store real sub id; mock: schedule next cycle)
  if (donation.subscription_id && ev.subscriptionProviderId) {
    const { data: sub } = await db
      .from("subscriptions").select("id, cadence, provider, provider_sub_id").eq("id", donation.subscription_id).single();
    if (sub) {
      await db.from("subscriptions").update({
        provider_sub_id: sub.provider_sub_id ?? ev.subscriptionProviderId,
        status: "active",
        ...(sub.provider === "mock" ? { next_charge_at: addCadence(paidAt, sub.cadence as Cadence).toISOString() } : {}),
      }).eq("id", sub.id);
    }
  }

  await processPaidDonation(donation.id);

  // emails — receipt to donor, notice to gift recipient
  const { data: tip } = await db.from("tips").select("amount_local").eq("donation_id", donation.id).maybeSingle();
  const { data: ded } = await db.from("dedications").select("kind, name").eq("donation_id", donation.id).maybeSingle();
  const { data: gift } = await db.from("gifts").select("recipient_name, recipient_email, message, notified_at").eq("donation_id", donation.id).maybeSingle();

  const currency = donation.currency as Currency;
  const tipLocal = (tip?.amount_local as number) ?? 0;
  const { data: subRow } = donation.subscription_id
    ? await db.from("subscriptions").select("cadence").eq("id", donation.subscription_id).single()
    : { data: null };

  const r = receiptEmail({
    number: receiptNumber,
    firstName: donor.first_name as string | null,
    quantity: donation.quantity_total as number,
    days: donation.days as number,
    mealsFmt: formatMoney(donation.amount_local as number, currency),
    tipFmt: tipLocal > 0 ? formatMoney(tipLocal, currency) : null,
    totalFmt: formatMoney((donation.amount_local as number) + tipLocal, currency),
    dedication: (ded as { kind: "memory" | "honor"; name: string } | null) ?? null,
    gift: gift ? { recipientName: gift.recipient_name as string } : null,
    isRecurring: donation.type === "recurring_cycle",
    cadence: (subRow?.cadence as string | null) ?? null,
  });
  await sendEmail({ to: donor.email as string, subject: r.subject, html: r.html, kind: "receipt", refId: donation.id });

  if (gift && !gift.notified_at) {
    const g = giftNoticeEmail({
      donorName: (donor.first_name as string | null) ?? "Someone",
      recipientName: gift.recipient_name as string,
      message: (gift.message as string | null) ?? null,
      quantity: donation.quantity_total as number,
    });
    await sendEmail({ to: gift.recipient_email as string, subject: g.subject, html: g.html, kind: "gift_notice", refId: donation.id });
    await db.from("gifts").update({ notified_at: paidAt.toISOString() }).eq("donation_id", donation.id);
  }

  await audit("system", "donation.paid", "donation", donation.id, { receipt: receiptNumber, provider_session: ev.sessionId });
}

/** Recurring renewal (stripe invoice.paid OR mock daily cron). Creates the cycle donation. */
export async function handleCyclePaid(ev: Extract<PaymentEvent, { type: "subscription.cycle_paid" }>): Promise<void> {
  const db = adminDb();
  const { data: sub } = await db
    .from("subscriptions")
    .select("id, donor_id, cadence, quantity, currency, amount_local, tip_local, status, provider, country_pref")
    .eq("provider_sub_id", ev.subscriptionProviderId)
    .maybeSingle();
  if (!sub || sub.status !== "active") return;

  const { data: donor } = await db.from("donors").select("id, tz").eq("id", sub.donor_id).single();
  const paidAt = await now();

  // idempotent cycle creation — provider_session_id carries the cycle key
  const { data: inserted, error } = await db
    .from("donations")
    .insert({
      donor_id: sub.donor_id,
      type: "recurring_cycle",
      status: "paid",
      quantity_total: sub.quantity,
      days: 1,
      per_day_quantity: sub.quantity,
      currency: sub.currency,
      amount_local: sub.amount_local,
      amount_inr: mealsAmountInr(sub.quantity as number),
      country_pref: sub.country_pref,
      donor_tz: (donor?.tz as string) ?? "Asia/Kolkata",
      subscription_id: sub.id,
      provider: sub.provider,
      provider_session_id: ev.cycleKey,
      paid_at: paidAt.toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") return; // cycle already processed
    throw error;
  }
  if (!inserted) return;

  if ((sub.tip_local as number) > 0) {
    await db.from("tips").insert({
      donation_id: inserted.id,
      percent: Math.round(((sub.tip_local as number) / (sub.amount_local as number)) * 100),
      amount_local: sub.tip_local,
      currency: sub.currency,
      amount_inr: Math.round((sub.tip_local as number) * (sub.currency === "INR" ? 1 : sub.currency === "USD" ? 83 : 22.6)),
    });
  }

  await updateStreakOnPayment(sub.donor_id as string, paidAt, (donor?.tz as string) ?? "Asia/Kolkata");
  const receiptNumber = await allocateReceipt(inserted.id as string);
  await processPaidDonation(inserted.id as string);

  const { data: donorRow } = await db.from("donors").select("email, first_name").eq("id", sub.donor_id).single();
  const r = receiptEmail({
    number: receiptNumber,
    firstName: (donorRow?.first_name as string | null) ?? null,
    quantity: sub.quantity as number,
    days: 1,
    mealsFmt: formatMoney(((sub.amount_local as number) - 0), sub.currency as Currency),
    tipFmt: (sub.tip_local as number) > 0 ? formatMoney(sub.tip_local as number, sub.currency as Currency) : null,
    totalFmt: formatMoney((sub.amount_local as number) + (sub.tip_local as number), sub.currency as Currency),
    dedication: null,
    gift: null,
    isRecurring: true,
    cadence: sub.cadence as string,
  });
  await sendEmail({ to: donorRow?.email as string, subject: r.subject, html: r.html, kind: "recurring_receipt", refId: inserted.id as string });
  await audit("system", "subscription.cycle_paid", "subscription", sub.id as string, { cycle: ev.cycleKey });
}

export async function handlePaymentFailed(ev: Extract<PaymentEvent, { type: "payment.failed" }>): Promise<void> {
  const db = adminDb();
  let donorEmail: string | null = null;
  let firstName: string | null = null;

  if (ev.donationId) {
    const { data: d } = await db
      .from("donations")
      .update({ status: "failed" })
      .eq("id", ev.donationId)
      .eq("status", "pending")
      .select("donor_id")
      .maybeSingle();
    if (d) {
      const { data: donor } = await db.from("donors").select("email, first_name").eq("id", d.donor_id).single();
      donorEmail = (donor?.email as string) ?? null;
      firstName = (donor?.first_name as string | null) ?? null;
    }
  } else if (ev.subscriptionProviderId) {
    const { data: sub } = await db.from("subscriptions").select("donor_id").eq("provider_sub_id", ev.subscriptionProviderId).maybeSingle();
    if (sub) {
      const { data: donor } = await db.from("donors").select("email, first_name").eq("id", sub.donor_id).single();
      donorEmail = (donor?.email as string) ?? null;
      firstName = (donor?.first_name as string | null) ?? null;
    }
  }

  if (donorEmail) {
    const m = paymentFailedEmail({ firstName });
    await sendEmail({ to: donorEmail, subject: m.subject, html: m.html, kind: "payment_failed", refId: ev.donationId ?? null });
  }
  await audit("system", "payment.failed", "donation", ev.donationId ?? ev.subscriptionProviderId ?? "unknown");
}
