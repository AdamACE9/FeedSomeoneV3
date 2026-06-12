import { adminDb } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/money";

export const metadata = { title: "Dashboard — FeedSomeone Ops" };

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-paper border border-line rounded p-4">
      <p className="timestamp text-ink/50 mb-1">{label}</p>
      <p className="font-[family-name:var(--font-fraunces)] font-black text-3xl text-ink">{value}</p>
      {sub && <p className="text-xs text-ink/60 mt-1">{sub}</p>}
    </div>
  );
}

export default async function AdminDashboard() {
  const db = adminDb();

  // Photos in pool
  const { count: photosAvailable } = await db
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("status", "available");

  // Waiting deliveries
  const { count: waitingDeliveries } = await db
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .eq("status", "waiting");

  // Partial days
  const { count: partialDays } = await db
    .from("donation_days")
    .select("id", { count: "exact", head: true })
    .eq("status", "partial");

  // Scheduled deliveries
  const { count: scheduledDeliveries } = await db
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled");

  // Donors count
  const { count: donorsCount } = await db
    .from("donors")
    .select("id", { count: "exact", head: true });

  // Today's IST day boundaries
  const now = new Date();
  // Simple IST offset: UTC+5:30
  const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMs);
  const ymd = istDate.toISOString().slice(0, 10);
  const todayStart = new Date(`${ymd}T00:00:00+05:30`).toISOString();
  const todayEnd = new Date(`${ymd}T23:59:59+05:30`).toISOString();

  // Today's donations (paid) — grouped by currency
  const { data: todayDonations } = await db
    .from("donations")
    .select("currency, amount_local")
    .eq("status", "paid")
    .gte("paid_at", todayStart)
    .lte("paid_at", todayEnd);

  // Today's tips
  const { data: todayTipRows } = await db
    .from("tips")
    .select("currency, amount_local, donations!inner(paid_at, status)")
    .gte("donations.paid_at", todayStart)
    .lte("donations.paid_at", todayEnd)
    .eq("donations.status", "paid");

  // Aggregate donations by currency
  const donationsByCurrency: Record<string, { sum: number; count: number }> = {};
  for (const row of todayDonations ?? []) {
    const c = row.currency as string;
    if (!donationsByCurrency[c]) donationsByCurrency[c] = { sum: 0, count: 0 };
    donationsByCurrency[c].sum += Number(row.amount_local);
    donationsByCurrency[c].count += 1;
  }

  // Aggregate tips by currency
  const tipsByCurrency: Record<string, number> = {};
  for (const row of todayTipRows ?? []) {
    const c = row.currency as string;
    if (!tipsByCurrency[c]) tipsByCurrency[c] = 0;
    tipsByCurrency[c] += Number(row.amount_local);
  }

  // Last 12 audit rows
  const { data: auditRows } = await db
    .from("audit_log")
    .select("id, actor, action, entity, entity_id, at")
    .order("at", { ascending: false })
    .limit(12);

  return (
    <div>
      <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl mb-6">Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard label="PHOTOS IN POOL" value={photosAvailable ?? 0} />
        <StatCard
          label="WAITING DELIVERIES"
          value={waitingDeliveries ?? 0}
          sub={partialDays ? `${partialDays} partial day${partialDays !== 1 ? "s" : ""}` : undefined}
        />
        <StatCard label="SCHEDULED" value={scheduledDeliveries ?? 0} />
        <StatCard label="DONORS" value={donorsCount ?? 0} />
      </div>

      {/* Today's donations per currency — SEPARATE from tips */}
      {Object.keys(donationsByCurrency).length > 0 && (
        <div className="mb-4">
          <p className="timestamp text-ink/50 mb-2">TODAY&apos;S DONATIONS (IST DAY)</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(donationsByCurrency).map(([currency, { sum, count }]) => (
              <StatCard
                key={currency}
                label={currency}
                value={formatMoney(sum, currency as Currency)}
                sub={`${count} donation${count !== 1 ? "s" : ""}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tips today — marigold tinted, structurally separate */}
      {Object.keys(tipsByCurrency).length > 0 && (
        <div className="mb-6">
          <p className="timestamp text-ink/50 mb-2">TIPS TODAY</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(tipsByCurrency).map(([currency, sum]) => (
              <div key={currency} className="bg-[#fdf3e2] border border-marigold rounded p-4">
                <p className="timestamp text-[#8a5a14] mb-1">{currency} · TIPS</p>
                <p className="font-[family-name:var(--font-fraunces)] font-black text-3xl text-ink">
                  {formatMoney(sum, currency as Currency)}
                </p>
                <p className="text-[10px] text-[#8a5a14] mt-1">Tips never touch donations.</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit log */}
      {auditRows && auditRows.length > 0 && (
        <div>
          <p className="timestamp text-ink/50 mb-2">RECENT ACTIVITY</p>
          <div className="bg-paper border border-line rounded divide-y divide-line">
            {auditRows.map((row) => (
              <div key={row.id} className="px-4 py-2 flex items-center justify-between gap-2">
                <span className="text-sm text-ink truncate">
                  {row.action}
                  {row.entity ? ` · ${row.entity}` : ""}
                </span>
                <span className="timestamp text-ink/40 shrink-0 text-[10px]">
                  {timeAgo(row.at as string)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
