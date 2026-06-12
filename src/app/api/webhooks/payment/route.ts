import { adminDb } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";
import { handleCheckoutCompleted, handleCyclePaid, handlePaymentFailed } from "@/lib/donation-flow";

/**
 * ONE webhook endpoint for both providers (locked architecture).
 * Day 1: the mock posts HMAC-signed normalized events here.
 * Day 2: Stripe posts real events; the provider verifies + normalizes.
 * Idempotency: webhook_events(provider, event_id) unique. If a handler throws,
 * the event row is removed so the provider's retry can reprocess.
 */
export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const provider = getPaymentProvider();
  const signature = req.headers.get("x-mock-signature") ?? req.headers.get("stripe-signature");

  let event;
  try {
    event = provider.constructWebhookEvent(raw, signature);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  if (!event) return Response.json({ ignored: true });

  const db = adminDb();
  const { error: dupErr } = await db.from("webhook_events").insert({
    provider: provider.name,
    event_id: event.id,
    type: event.type,
    payload: JSON.parse(raw),
  });
  if (dupErr) {
    if ((dupErr as { code?: string }).code === "23505") return Response.json({ duplicate: true });
    return new Response("event log failure", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.completed":
        await handleCheckoutCompleted(event);
        break;
      case "subscription.cycle_paid":
        await handleCyclePaid(event);
        break;
      case "payment.failed":
        await handlePaymentFailed(event);
        break;
    }
    await db.from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("provider", provider.name)
      .eq("event_id", event.id);
    return Response.json({ received: true });
  } catch (err) {
    // let the provider retry — clear the dedupe row
    await db.from("webhook_events").delete().eq("provider", provider.name).eq("event_id", event.id);
    console.error("webhook handler failed", err);
    return new Response("handler failure", { status: 500 });
  }
}
