import { NextRequest, NextResponse } from "next/server";
import { currentUser, adminDb } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!from || !to) {
    return new NextResponse("Missing from/to params", { status: 400 });
  }

  const db = adminDb();

  // Section 1: Donations
  const { data: donations } = await db
    .from("donations")
    .select("id, status, paid_at, quantity_total, currency, amount_local, amount_inr, provider, receipts(number), donors(email)")
    .eq("status", "paid")
    .gte("paid_at", from)
    .lte("paid_at", to)
    .order("paid_at", { ascending: true });

  // Section 2: Tips
  const { data: tips } = await db
    .from("tips")
    .select("id, currency, amount_local, amount_inr, percent, donations!inner(paid_at, status, donors(email))")
    .gte("donations.paid_at", from)
    .lte("donations.paid_at", to)
    .eq("donations.status", "paid");

  const rows: string[] = [];

  // Header + donations
  rows.push("DONATIONS");
  rows.push("receipt,date,email,qty,currency,amount_local,amount_inr,provider");
  for (const d of donations ?? []) {
    const receipt = (d.receipts as unknown as { number: string } | null);
    const donor = (d.donors as unknown as { email: string } | null);
    rows.push([
      receipt?.number ?? "",
      d.paid_at ? new Date(d.paid_at as string).toISOString().slice(0, 10) : "",
      donor?.email ?? "",
      String(d.quantity_total),
      d.currency as string,
      String(d.amount_local),
      String(d.amount_inr),
      d.provider as string,
    ].join(","));
  }

  // Blank separator
  rows.push("");

  // Tips
  rows.push("TIPS");
  rows.push("date,email,currency,amount_local,amount_inr,percent");
  for (const t of tips ?? []) {
    const donation = t.donations as unknown as { paid_at: string; donors: { email: string } | null };
    rows.push([
      donation?.paid_at ? new Date(donation.paid_at).toISOString().slice(0, 10) : "",
      donation?.donors?.email ?? "",
      t.currency as string,
      String(t.amount_local),
      String(t.amount_inr),
      String(t.percent),
    ].join(","));
  }

  const csv = rows.join("\n");
  const fromLabel = from.slice(0, 10).replace(/-/g, "");
  const toLabel = to.slice(0, 10).replace(/-/g, "");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="feedsomeone-${fromLabel}-${toLabel}.csv"`,
    },
  });
}
