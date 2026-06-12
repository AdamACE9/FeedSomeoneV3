import crypto from "node:crypto";
import Stripe from "stripe";
import type { CheckoutInput, CheckoutSession, PaymentEvent, PaymentProvider } from "./types";

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/* ────────────────────────────────────────────────────────────────────────────
 * MOCK — production-shaped. Fires HMAC-signed, normalized events at the real
 * webhook endpoint over HTTP, so Day-1 exercises the exact Day-2 code path.
 * ──────────────────────────────────────────────────────────────────────────── */

export function mockSign(body: string): string {
  return crypto.createHmac("sha256", process.env.MOCK_WEBHOOK_SECRET ?? "").update(body).digest("hex");
}

export async function fireMockWebhook(event: PaymentEvent): Promise<void> {
  const body = JSON.stringify(event);
  const res = await fetch(`${site()}/api/webhooks/payment`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mock-signature": mockSign(body) },
    body,
  });
  if (!res.ok) throw new Error(`mock webhook delivery failed: ${res.status} ${await res.text()}`);
}

export function mockEventForSession(sessionId: string, donationId: string, mode: "payment" | "subscription"): PaymentEvent {
  return {
    id: `evt_mock_${sessionId}`,
    type: "checkout.completed",
    donationId,
    sessionId,
    subscriptionProviderId: mode === "subscription" ? `mock_sub_${donationId}` : null,
  };
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const id = `mock_cs_${input.donationId}`;
    if (process.env.MOCK_AUTOCONFIRM === "1") {
      await fireMockWebhook(mockEventForSession(id, input.donationId, input.mode));
      return { id, url: input.successUrl };
    }
    const u = new URL(`${site()}/mock-checkout/${id}`);
    u.searchParams.set("donation", input.donationId);
    u.searchParams.set("mode", input.mode);
    u.searchParams.set("success", input.successUrl);
    u.searchParams.set("cancel", input.cancelUrl);
    return { id, url: u.toString() };
  }

  constructWebhookEvent(rawBody: string, signature: string | null): PaymentEvent | null {
    const expected = mockSign(rawBody);
    const given = signature ?? "";
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(given, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error("invalid mock webhook signature");
    }
    return JSON.parse(rawBody) as PaymentEvent;
  }

  /* mock subscriptions are driven by subscriptions.next_charge_at + the daily cron */
  async cancelSubscription(): Promise<void> {}
  async pauseSubscription(): Promise<void> {}
  async resumeSubscription(): Promise<void> {}
}

/* ────────────────────────────────────────────────────────────────────────────
 * STRIPE — real. Inline price_data (donation amounts vary), meals + tip as
 * separate line items, normalized event mapping.
 * ──────────────────────────────────────────────────────────────────────────── */

let _stripe: Stripe | null = null;
function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
  return _stripe;
}

const CADENCE_INTERVAL = { daily: "day", weekly: "week", monthly: "month" } as const;

/** Stripe moved Invoice.subscription under parent.subscription_details (Basil API) — read both shapes. */
function invoiceSubId(inv: Stripe.Invoice): string | null {
  const legacy = (inv as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;
  const parent = (inv as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  }).parent;
  const s = parent?.subscription_details?.subscription;
  if (typeof s === "string") return s;
  if (s && typeof s === "object") return s.id;
  return null;
}

class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe" as const;

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const currency = input.currency.toLowerCase();
    const mealName = input.quantity === 1 ? "Feed one child" : `Feed ${input.quantity} children`;

    const session = await stripe().checkout.sessions.create(
      input.mode === "payment"
        ? {
            mode: "payment",
            customer_email: input.donorEmail,
            line_items: [
              { quantity: 1, price_data: { currency, unit_amount: input.mealsLocal, product_data: { name: mealName } } },
              ...(input.tipLocal > 0
                ? [{ quantity: 1, price_data: { currency, unit_amount: input.tipLocal, product_data: { name: "Optional tip for FeedSomeone" } } }]
                : []),
            ],
            metadata: { donation_id: input.donationId },
            success_url: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: input.cancelUrl,
          }
        : {
            mode: "subscription",
            customer_email: input.donorEmail,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency,
                  unit_amount: input.mealsLocal + input.tipLocal,
                  recurring: { interval: CADENCE_INTERVAL[input.cadence ?? "monthly"] },
                  product_data: { name: `${mealName} — ${input.cadence ?? "monthly"}` },
                },
              },
            ],
            metadata: { donation_id: input.donationId },
            subscription_data: { metadata: { donation_id: input.donationId } },
            success_url: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: input.cancelUrl,
          },
    );
    if (!session.url) throw new Error("stripe returned no checkout url");
    return { id: session.id, url: session.url };
  }

  constructWebhookEvent(rawBody: string, signature: string | null): PaymentEvent | null {
    const event = stripe().webhooks.constructEvent(rawBody, signature ?? "", process.env.STRIPE_WEBHOOK_SECRET ?? "");

    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const donationId = s.metadata?.donation_id;
        if (!donationId) return null;
        return {
          id: event.id,
          type: "checkout.completed",
          donationId,
          sessionId: s.id,
          subscriptionProviderId: typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null),
        };
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.billing_reason !== "subscription_cycle") return null; // first invoice ⇒ checkout.completed covers it
        const subId = invoiceSubId(inv);
        if (!subId) return null;
        return { id: event.id, type: "subscription.cycle_paid", subscriptionProviderId: subId, cycleKey: inv.id ?? event.id };
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        return { id: event.id, type: "payment.failed", donationId: null, subscriptionProviderId: invoiceSubId(inv) };
      }
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        return { id: event.id, type: "payment.failed", donationId: s.metadata?.donation_id ?? null, subscriptionProviderId: null };
      }
      default:
        return null;
    }
  }

  async cancelSubscription(providerSubId: string): Promise<void> {
    await stripe().subscriptions.cancel(providerSubId);
  }
  async pauseSubscription(providerSubId: string): Promise<void> {
    await stripe().subscriptions.update(providerSubId, { pause_collection: { behavior: "mark_uncollectible" } });
  }
  async resumeSubscription(providerSubId: string): Promise<void> {
    await stripe().subscriptions.update(providerSubId, { pause_collection: null });
  }
}

/* ──────────────────────────────────────────────────────────────────────────── */

let _provider: PaymentProvider | null = null;
export function getPaymentProvider(): PaymentProvider {
  if (!_provider) {
    _provider = process.env.PAYMENT_PROVIDER === "stripe" ? new StripePaymentProvider() : new MockPaymentProvider();
  }
  return _provider;
}

export type { CheckoutInput, CheckoutSession, PaymentEvent, PaymentProvider, Cadence, CheckoutMode } from "./types";
