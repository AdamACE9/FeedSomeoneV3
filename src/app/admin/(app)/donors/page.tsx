import { adminDb } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/money";
import Link from "next/link";

export const metadata = { title: "Donors — FeedSomeone Ops" };

export default async function DonorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const db = adminDb();

  let query = db
    .from("donors")
    .select("id, email, first_name, currency, tz, first_donation_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%`);
  }

  const { data: donors } = await query;

  // For each donor get total meals (paid)
  const donorIds = (donors ?? []).map((d) => d.id as string);
  const totalsMap: Record<string, { total: number; currency: string }> = {};
  if (donorIds.length > 0) {
    const { data: totals } = await db
      .from("donations")
      .select("donor_id, quantity_total, currency")
      .in("donor_id", donorIds)
      .eq("status", "paid");
    for (const t of totals ?? []) {
      const id = t.donor_id as string;
      if (!totalsMap[id]) totalsMap[id] = { total: 0, currency: t.currency as string };
      totalsMap[id].total += Number(t.quantity_total);
    }
  }

  return (
    <div>
      <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl mb-4">Donors</h2>

      <form method="GET" className="mb-6">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by email or name…"
          className="w-full max-w-sm border border-line rounded px-3 py-2 text-sm text-ink bg-paper focus:outline-none focus:border-clay"
        />
      </form>

      <div className="space-y-3">
        {(donors ?? []).map((donor) => {
          const t = totalsMap[donor.id as string];
          return (
            <Link
              key={donor.id as string}
              href={`/admin/donors/${donor.id}`}
              className="block border border-line rounded p-4 hover:border-clay transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {donor.email as string}
                  </p>
                  <p className="text-xs text-ink/60">
                    {donor.first_name as string | null ?? "—"} · {donor.currency as string}
                  </p>
                </div>
                {t && (
                  <p className="timestamp text-xs text-ink/50 shrink-0">
                    {t.total} meal{t.total !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              {donor.first_donation_at && (
                <p className="timestamp text-[10px] text-ink/40 mt-1">
                  Since {new Date(donor.first_donation_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </Link>
          );
        })}
        {(donors ?? []).length === 0 && (
          <p className="text-sm text-ink/50 py-8 text-center">No donors found.</p>
        )}
      </div>
    </div>
  );
}
