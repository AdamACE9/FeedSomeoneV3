import { adminDb } from "@/lib/supabase/server";
import type { Currency } from "@/lib/money";

/** Idempotent: returns the existing number if this donation already has one. */
export async function allocateReceipt(donationId: string): Promise<string> {
  const db = adminDb();
  const { data: existing } = await db.from("receipts").select("number").eq("donation_id", donationId).maybeSingle();
  if (existing?.number) return existing.number as string;
  const { data, error } = await db.rpc("allocate_receipt", { p_donation_id: donationId });
  if (error) throw error;
  return data as string;
}

export interface ReceiptBundle {
  number: string;
  issuedAt: string;
  donation: {
    id: string;
    quantity_total: number;
    days: number;
    per_day_quantity: number;
    currency: Currency;
    amount_local: number;
    amount_inr: number;
    is_classroom: boolean;
    type: string;
    paid_at: string | null;
  };
  donor: { email: string; first_name: string | null };
  tip: { percent: number; amount_local: number } | null;
  dedication: { kind: "memory" | "honor"; name: string } | null;
  gift: { recipient_name: string; recipient_email: string } | null;
}

export async function getReceiptBundle(donationId: string): Promise<ReceiptBundle | null> {
  const db = adminDb();
  const { data: r } = await db.from("receipts").select("number, issued_at").eq("donation_id", donationId).maybeSingle();
  if (!r) return null;
  const { data: d } = await db
    .from("donations")
    .select("id, quantity_total, days, per_day_quantity, currency, amount_local, amount_inr, is_classroom, type, paid_at, donors(email, first_name)")
    .eq("id", donationId)
    .single();
  if (!d) return null;
  const { data: tip } = await db.from("tips").select("percent, amount_local").eq("donation_id", donationId).maybeSingle();
  const { data: ded } = await db.from("dedications").select("kind, name").eq("donation_id", donationId).maybeSingle();
  const { data: gift } = await db.from("gifts").select("recipient_name, recipient_email").eq("donation_id", donationId).maybeSingle();
  const donor = d.donors as unknown as { email: string; first_name: string | null };
  return {
    number: r.number as string,
    issuedAt: r.issued_at as string,
    donation: d as unknown as ReceiptBundle["donation"],
    donor,
    tip: (tip as ReceiptBundle["tip"]) ?? null,
    dedication: (ded as ReceiptBundle["dedication"]) ?? null,
    gift: (gift as ReceiptBundle["gift"]) ?? null,
  };
}
