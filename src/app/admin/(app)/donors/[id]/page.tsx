import { adminDb, currentUser } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/money";
import { notFound } from "next/navigation";
import SubActions from "./SubActions";

export const metadata = { title: "Donor — FeedSomeone Ops" };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function DonorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = adminDb();
  const user = await currentUser();

  const { data: donor } = await db
    .from("donors")
    .select("id, email, first_name, currency, tz, first_donation_at, created_at")
    .eq("id", id)
    .single();

  if (!donor) notFound();

  // Streak
  const { data: streak } = await db.from("streaks").select("current, longest").eq("donor_id", id).maybeSingle();

  // Donations
  const { data: donations } = await db
    .from("donations")
    .select("id, status, quantity_total, currency, amount_local, amount_inr, days, created_at, receipts(number)")
    .eq("donor_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Deliveries
  const { data: deliveries } = await db
    .from("deliveries")
    .select("id, status, scheduled_at, sent_at, recipient_email")
    .eq("donor_id", id)
    .order("scheduled_at", { ascending: false })
    .limit(20);

  // Subscriptions
  const { data: subscriptions } = await db
    .from("subscriptions")
    .select("id, status, cadence, quantity, currency, amount_local, provider, provider_sub_id, created_at")
    .eq("donor_id", id)
    .order("created_at", { ascending: false });

  // Total meals
  const totalMeals = (donations ?? [])
    .filter((d) => d.status === "paid")
    .reduce((s, d) => s + Number(d.quantity_total), 0);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl">
          {donor.email as string}
        </h2>
        <p className="text-sm text-ink/60 mt-1">
          {donor.first_name as string | null ?? "No name"} · {donor.currency as string} · {donor.tz as string}
        </p>
        <div className="flex flex-wrap gap-3 mt-3">
          <span className="timestamp text-xs text-ink/50">
            {totalMeals} total meal{totalMeals !== 1 ? "s" : ""}
          </span>
          {streak && (
            <span className="timestamp text-xs text-ink/50">
              streak {streak.current} (best {streak.longest})
            </span>
          )}
          <span className="timestamp text-xs text-ink/50">since {fmtDate(donor.first_donation_at as string | null)}</span>
        </div>
      </div>

      {/* Subscriptions */}
      {(subscriptions ?? []).length > 0 && (
        <section className="mb-6">
          <h3 className="font-semibold text-base mb-3">Subscriptions</h3>
          <div className="space-y-2">
            {(subscriptions ?? []).map((sub) => (
              <div key={sub.id as string} className="border border-line rounded p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span
                      className={`timestamp text-xs px-2 py-0.5 rounded-full ${
                        sub.status === "active"
                          ? "bg-leaf/10 text-leaf"
                          : sub.status === "paused"
                          ? "bg-marigold/20 text-[#8a5a14]"
                          : "bg-sand text-ink/50"
                      }`}
                    >
                      {sub.status as string}
                    </span>
                    <span className="text-sm ml-2">
                      {sub.quantity} child{Number(sub.quantity) !== 1 ? "ren" : ""} · {sub.cadence} ·{" "}
                      {formatMoney(Number(sub.amount_local), sub.currency as Currency)}
                    </span>
                  </div>
                  <SubActions
                    subId={sub.id as string}
                    status={sub.status as string}
                    actorEmail={user?.email ?? "admin"}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Donations */}
      <section className="mb-6">
        <h3 className="font-semibold text-base mb-3">Donations</h3>
        <div className="space-y-2">
          {(donations ?? []).map((d) => {
            const receipt = (d.receipts as unknown as { number: string } | null);
            return (
              <div key={d.id as string} className="border border-line rounded p-3 text-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="timestamp text-xs bg-sand px-2 py-0.5 rounded">
                    {d.status as string}
                  </span>
                  <span className="text-ink/60 text-xs">{fmtDate(d.created_at as string)}</span>
                </div>
                <p className="mt-1">
                  {d.quantity_total} meal{Number(d.quantity_total) !== 1 ? "s" : ""} ·{" "}
                  {formatMoney(Number(d.amount_local), d.currency as Currency)}
                </p>
                {receipt?.number && (
                  <p className="timestamp text-[10px] text-ink/40 mt-0.5">{receipt.number}</p>
                )}
              </div>
            );
          })}
          {(donations ?? []).length === 0 && (
            <p className="text-sm text-ink/50">No donations.</p>
          )}
        </div>
      </section>

      {/* Deliveries */}
      <section>
        <h3 className="font-semibold text-base mb-3">Deliveries</h3>
        <div className="space-y-2">
          {(deliveries ?? []).map((d) => (
            <div key={d.id as string} className="border border-line rounded p-3 text-sm flex items-center justify-between">
              <span className="timestamp text-xs">{d.status as string}</span>
              <span className="timestamp text-[10px] text-ink/40">
                {fmtDate((d.sent_at ?? d.scheduled_at) as string | null)}
              </span>
            </div>
          ))}
          {(deliveries ?? []).length === 0 && (
            <p className="text-sm text-ink/50">No deliveries.</p>
          )}
        </div>
      </section>
    </div>
  );
}
