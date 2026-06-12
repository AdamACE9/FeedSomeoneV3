import type { Currency } from "@/lib/money";

export type Cadence = "daily" | "weekly" | "monthly";
export type CheckoutMode = "payment" | "subscription";

export interface CheckoutInput {
  donationId: string;
  mode: CheckoutMode;
  /** meals total in smallest local unit (tip listed separately) */
  mealsLocal: number;
  tipLocal: number;
  currency: Currency;
  quantity: number;
  cadence?: Cadence;
  donorEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/** Normalized events — the webhook handler never sees provider-specific shapes. */
export type PaymentEvent =
  | { id: string; type: "checkout.completed"; donationId: string; sessionId: string; subscriptionProviderId: string | null }
  | { id: string; type: "subscription.cycle_paid"; subscriptionProviderId: string; cycleKey: string }
  | { id: string; type: "payment.failed"; donationId: string | null; subscriptionProviderId: string | null };

export interface PaymentProvider {
  readonly name: "mock" | "stripe";
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Verifies signature; returns null for events we deliberately ignore; throws on bad signature. */
  constructWebhookEvent(rawBody: string, signature: string | null): PaymentEvent | null;
  cancelSubscription(providerSubId: string): Promise<void>;
  pauseSubscription(providerSubId: string): Promise<void>;
  resumeSubscription(providerSubId: string): Promise<void>;
}
