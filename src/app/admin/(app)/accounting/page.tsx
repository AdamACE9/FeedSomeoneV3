import { adminDb } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/money";
import Link from "next/link";

export const metadata = { title: "Accounting — FeedSomeone Ops" };

function getISTMonthBounds(monthStr: string): { start: string; end: string } {
  // monthStr = "YYYY-MM"
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000);
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999) - (5 * 60 + 30) * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = params.month ?? defaultMonth;

  const { start, end } = getISTMonthBounds(month);
  const db = adminDb();

  // Donations (paid) in month
  const { data: donations } = await db
    .from("donations")
    .select("currency, amount_local, amount_inr")
    .eq("status", "paid")
    .gte("paid_at", start)
    .lte("paid_at", end);

  // Tips in month (join to paid donations)
  const { data: tips } = await db
    .from("tips")
    .select("currency, amount_local, amount_inr, donations!inner(paid_at, status)")
    .gte("donations.paid_at", start)
    .lte("donations.paid_at", end)
    .eq("donations.status", "paid");

  // Aggregate donations by currency
  type CurrencyAgg = { sumLocal: number; sumInr: number; count: number };
  const donAgg: Record<string, CurrencyAgg> = {};
  for (const d of donations ?? []) {
    const c = d.currency as string;
    if (!donAgg[c]) donAgg[c] = { sumLocal: 0, sumInr: 0, count: 0 };
    donAgg[c].sumLocal += Number(d.amount_local);
    donAgg[c].sumInr += Number(d.amount_inr);
    donAgg[c].count++;
  }

  const tipAgg: Record<string, CurrencyAgg> = {};
  for (const t of tips ?? []) {
    const c = t.currency as string;
    if (!tipAgg[c]) tipAgg[c] = { sumLocal: 0, sumInr: 0, count: 0 };
    tipAgg[c].sumLocal += Number(t.amount_local);
    tipAgg[c].sumInr += Number(t.amount_inr);
    tipAgg[c].count++;
  }

  const totalDonInr = Object.values(donAgg).reduce((s, a) => s + a.sumInr, 0);
  const totalTipInr = Object.values(tipAgg).reduce((s, a) => s + a.sumInr, 0);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl">Accounting</h2>
        <form method="GET">
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="border border-line rounded px-3 py-2 text-sm bg-paper focus:outline-none focus:border-clay min-h-[44px]"
          />
        </form>
        <Link
          href={`/admin/accounting/export?from=${start}&to=${end}`}
          className="timestamp text-xs border border-line rounded px-3 py-2 min-h-[44px] flex items-center hover:bg-sand"
        >
          Export CSV
        </Link>
      </div>

      {/* Donations section */}
      <section className="mb-8">
        <h3 className="font-semibold text-base mb-3">Donations</h3>
        {Object.keys(donAgg).length === 0 ? (
          <p className="text-sm text-ink/50">No paid donations this month.</p>
        ) : (
          <div className="border border-line rounded divide-y divide-line">
            {Object.entries(donAgg).map(([currency, agg]) => (
              <div key={currency} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{currency}</span>
                  <span className="timestamp text-xs text-ink/50 ml-2">{agg.count} donations</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatMoney(agg.sumLocal, currency as Currency)}</p>
                  <p className="timestamp text-[10px] text-ink/50">
                    {formatMoney(agg.sumInr, "INR")} INR canonical
                  </p>
                </div>
              </div>
            ))}
            <div className="px-4 py-3 flex items-center justify-between bg-sand">
              <span className="text-sm font-semibold">Total (INR canonical)</span>
              <span className="text-sm font-semibold">{formatMoney(totalDonInr, "INR")}</span>
            </div>
          </div>
        )}
      </section>

      {/* Tips section — structurally separate */}
      <section className="mb-4">
        <h3 className="font-semibold text-base mb-3">Tips</h3>
        {Object.keys(tipAgg).length === 0 ? (
          <p className="text-sm text-ink/50">No tips this month.</p>
        ) : (
          <div className="border border-marigold rounded divide-y divide-marigold/30">
            {Object.entries(tipAgg).map(([currency, agg]) => (
              <div key={currency} className="px-4 py-3 flex items-center justify-between bg-[#fdf3e2]">
                <div>
                  <span className="text-sm font-medium">{currency}</span>
                  <span className="timestamp text-xs text-[#8a5a14] ml-2">{agg.count} tips</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatMoney(agg.sumLocal, currency as Currency)}</p>
                  <p className="timestamp text-[10px] text-[#8a5a14]">
                    {formatMoney(agg.sumInr, "INR")} INR canonical
                  </p>
                </div>
              </div>
            ))}
            <div className="px-4 py-3 flex items-center justify-between bg-[#fdf3e2]">
              <span className="text-sm font-semibold text-[#8a5a14]">Tips total (INR canonical)</span>
              <span className="text-sm font-semibold text-[#8a5a14]">{formatMoney(totalTipInr, "INR")}</span>
            </div>
          </div>
        )}
        <p className="timestamp text-[10px] text-ink/40 mt-2">
          Tips never touch donations. Separation is structural.
        </p>
      </section>
    </div>
  );
}
