import { notFound } from "next/navigation";
import { adminDb } from "@/lib/supabase/server";
import { formatMoney, type Currency } from "@/lib/money";
import { failMockSession, payMockSession } from "./actions";

/**
 * Day-1 stand-in for Stripe Checkout. Looks like a payment page, behaves like
 * one (success AND failure paths), and fires the same webhooks Stripe would.
 * Disappears entirely when PAYMENT_PROVIDER=stripe.
 */
export default async function MockCheckout({
  params, searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.PAYMENT_PROVIDER === "stripe") notFound();
  const { sessionId } = await params;
  const sp = await searchParams;
  const donationId = typeof sp.donation === "string" ? sp.donation : "";
  const mode = typeof sp.mode === "string" ? sp.mode : "payment";
  const successUrl = typeof sp.success === "string" ? sp.success : "/";
  const cancelUrl = typeof sp.cancel === "string" ? sp.cancel : "/";

  const { data: donation } = await adminDb()
    .from("donations")
    .select("id, quantity_total, days, currency, amount_local, status")
    .eq("id", donationId)
    .maybeSingle();
  if (!donation) notFound();

  const { data: tip } = await adminDb().from("tips").select("amount_local").eq("donation_id", donationId).maybeSingle();
  const currency = donation.currency as Currency;
  const tipLocal = (tip?.amount_local as number) ?? 0;
  const childWord = (donation.quantity_total as number) === 1 ? "child" : "children";

  return (
    <main className="min-h-screen bg-sand flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-paper border border-line p-6 sm:p-8">
        <p className="timestamp text-clay mb-4">MOCK CHECKOUT · TEST MODE · NO REAL MONEY</p>
        <h1 className="font-[family-name:var(--font-fraunces)] font-black text-2xl mb-6">
          Feed {donation.quantity_total} {childWord}
          {(donation.days as number) > 1 ? ` · ${donation.days} days` : ""}
        </h1>

        <dl className="text-sm space-y-2 mb-6">
          <div className="flex justify-between"><dt>Meals</dt><dd>{formatMoney(donation.amount_local as number, currency)}</dd></div>
          {tipLocal > 0 && (
            <div className="flex justify-between"><dt>Tip for FeedSomeone</dt><dd>{formatMoney(tipLocal, currency)}</dd></div>
          )}
          <div className="flex justify-between border-t border-line pt-2 font-bold">
            <dt>Total</dt><dd>{formatMoney((donation.amount_local as number) + tipLocal, currency)}</dd>
          </div>
        </dl>

        {donation.status !== "pending" ? (
          <p className="text-sm text-leaf">This session is already {donation.status}.</p>
        ) : (
          <div className="space-y-3">
            <form action={payMockSession}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="donationId" value={donationId} />
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="successUrl" value={successUrl} />
              <button className="w-full min-h-[48px] bg-clay hover:bg-clay-deep text-paper font-bold text-base px-6 py-3 transition-colors">
                Pay (test) →
              </button>
            </form>
            <form action={failMockSession}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="donationId" value={donationId} />
              <input type="hidden" name="cancelUrl" value={cancelUrl} />
              <button className="w-full min-h-[44px] border border-line text-ink/60 text-sm px-6 py-2.5 hover:bg-sand transition-colors">
                Simulate failure
              </button>
            </form>
          </div>
        )}
        <p className="timestamp mt-6 text-ink/50">SESSION {sessionId.slice(0, 24)}…</p>
      </div>
    </main>
  );
}
