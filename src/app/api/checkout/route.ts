import { z } from "zod";
import { adminDb } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";
import {
  MIN_QUANTITY, formatMoney, isCurrency, localToInr, mealsAmountInr, mealsAmountLocal, tipAmountLocal,
} from "@/lib/money";
import { countryFromHeaders, resolveCurrency } from "@/lib/geo";
import { isValidTz } from "@/lib/timewindow";

const Body = z.object({
  email: z.string().email(),
  firstName: z.string().trim().max(40).optional(),
  anonymous: z.boolean().optional(),
  mode: z.enum(["one_time", "scheduled", "recurring"]).default("one_time"),
  /** one_time: total children · scheduled: children PER DAY · recurring: children per cycle */
  quantity: z.number().int().min(1).max(1000),
  days: z.number().int().min(1).max(30).default(1),
  cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  classroom: z.boolean().optional(),
  tipPercent: z.number().int().min(0).max(50),
  currency: z.string().optional(),
  clientTz: z.string().max(64).optional(),
  countryPref: z.string().length(2).nullable().optional(),
  dedication: z.object({ kind: z.enum(["memory", "honor"]), name: z.string().trim().min(1).max(80) }).nullable().optional(),
  gift: z.object({
    recipientName: z.string().trim().min(1).max(80),
    recipientEmail: z.string().email(),
    message: z.string().trim().max(280).optional(),
  }).nullable().optional(),
  qrSlug: z.string().max(64).nullable().optional(),
});

const TZ_DEFAULT = { INR: "Asia/Kolkata", AED: "Asia/Dubai", USD: "America/New_York" } as const;
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const b = parsed.data;
  const db = adminDb();

  // currency: client-resolved if valid, else headers → tz hint → fallback (no picker, ever)
  const currency = isCurrency(b.currency) ? b.currency : resolveCurrency(countryFromHeaders(req.headers), b.clientTz);
  const donorTz = isValidTz(b.clientTz) ? b.clientTz : TZ_DEFAULT[currency];

  // shape: classroom is a one-time 30-pack
  const mode = b.classroom ? "one_time" : b.mode;
  const perDay = b.classroom ? 30 : b.quantity;
  const days = mode === "scheduled" ? b.days : 1;
  const quantityTotal = perDay * days;
  if (mode === "recurring" && !b.cadence) {
    return Response.json({ error: "cadence required for recurring" }, { status: 400 });
  }

  // per-charge network minimums (plan §11 R1): one_time/scheduled charge once; recurring per cycle
  const minQ = MIN_QUANTITY[currency];
  const chargeQuantity = mode === "recurring" ? perDay : quantityTotal;
  if (chargeQuantity < minQ) {
    return Response.json({
      error: `Card networks require a small minimum in ${currency} — please feed at least ${minQ} children`,
      minQuantity: minQ,
    }, { status: 400 });
  }

  const mealsLocal = mealsAmountLocal(mode === "recurring" ? perDay : quantityTotal, currency);
  const tipLocal = tipAmountLocal(mealsLocal, b.tipPercent);

  // country preference only if explicitly chosen + enabled (null = any country: launch-safe)
  let countryPref: string | null = null;
  if (b.countryPref) {
    const { data: c } = await db.from("countries").select("code").eq("code", b.countryPref.toUpperCase()).eq("enabled", true).maybeSingle();
    countryPref = (c?.code as string) ?? null;
  }

  // guest-first donor upsert — never clobber a name with null
  const donorPatch: Record<string, unknown> = { email: b.email.toLowerCase(), currency, tz: donorTz };
  if (b.firstName) donorPatch.first_name = b.firstName;
  if (typeof b.anonymous === "boolean") donorPatch.is_anonymous = b.anonymous;
  const { data: donor, error: donorErr } = await db
    .from("donors").upsert(donorPatch, { onConflict: "email" }).select("id").single();
  if (donorErr || !donor) return Response.json({ error: "donor upsert failed" }, { status: 500 });

  const provider = getPaymentProvider();

  // recurring ⇒ subscription shell first
  let subscriptionId: string | null = null;
  if (mode === "recurring") {
    const { data: sub, error: subErr } = await db.from("subscriptions").insert({
      donor_id: donor.id, cadence: b.cadence, quantity: perDay, currency,
      amount_local: mealsLocal, tip_local: tipLocal, status: "active",
      provider: provider.name, provider_sub_id: null, country_pref: countryPref,
    }).select("id").single();
    if (subErr || !sub) return Response.json({ error: "subscription create failed" }, { status: 500 });
    subscriptionId = sub.id as string;
  }

  // QR attribution
  let qrCampaignId: string | null = null;
  if (b.qrSlug) {
    const { data: qr } = await db.from("qr_campaigns").select("id, scans").eq("slug", b.qrSlug).maybeSingle();
    if (qr) {
      qrCampaignId = qr.id as string;
      await db.from("qr_campaigns").update({ scans: ((qr.scans as number) ?? 0) + 1 }).eq("id", qr.id);
    }
  }

  const { data: donation, error: dErr } = await db.from("donations").insert({
    donor_id: donor.id,
    type: mode === "recurring" ? "recurring_cycle" : mode === "scheduled" ? "scheduled" : "one_time",
    status: "pending",
    quantity_total: mode === "recurring" ? perDay : quantityTotal,
    days: mode === "recurring" ? 1 : days,
    per_day_quantity: perDay,
    is_classroom: Boolean(b.classroom),
    currency,
    amount_local: mealsLocal,
    amount_inr: mealsAmountInr(mode === "recurring" ? perDay : quantityTotal),
    country_pref: countryPref,
    donor_tz: donorTz,
    subscription_id: subscriptionId,
    qr_campaign_id: qrCampaignId,
    provider: provider.name,
  }).select("id").single();
  if (dErr || !donation) return Response.json({ error: "donation create failed" }, { status: 500 });

  if (tipLocal > 0) {
    await db.from("tips").insert({
      donation_id: donation.id, percent: b.tipPercent,
      amount_local: tipLocal, currency, amount_inr: localToInr(tipLocal, currency),
    });
  }
  if (b.dedication) await db.from("dedications").insert({ donation_id: donation.id, kind: b.dedication.kind, name: b.dedication.name });
  if (b.gift) await db.from("gifts").insert({
    donation_id: donation.id, recipient_name: b.gift.recipientName,
    recipient_email: b.gift.recipientEmail.toLowerCase(), message: b.gift.message ?? null,
  });

  try {
    const session = await provider.createCheckout({
      donationId: donation.id as string,
      mode: mode === "recurring" ? "subscription" : "payment",
      mealsLocal, tipLocal, currency,
      quantity: mode === "recurring" ? perDay : quantityTotal,
      cadence: b.cadence,
      donorEmail: b.email.toLowerCase(),
      successUrl: `${SITE()}/thanks/${donation.id}`,
      cancelUrl: `${SITE()}/donate?canceled=1`,
    });
    return Response.json({
      url: session.url,
      donationId: donation.id,
      summary: {
        currency,
        meals: formatMoney(mealsLocal, currency),
        tip: tipLocal > 0 ? formatMoney(tipLocal, currency) : null,
        total: formatMoney(mealsLocal + tipLocal, currency),
      },
    });
  } catch (err) {
    console.error("provider checkout failed", err);
    await db.from("donations").update({ status: "failed" }).eq("id", donation.id).eq("status", "pending");
    return Response.json({ error: "payment provider unavailable" }, { status: 502 });
  }
}
