import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb } from "@/lib/supabase/server";
import { formatMoney, type Currency } from "@/lib/money";
import { countWords } from "@/lib/email/render";
import StatusPanel from "@/components/thanks/StatusPanel";

export const dynamic = "force-dynamic";

export default async function ThanksPage({ params }: { params: Promise<{ donationId: string }> }) {
  const { donationId } = await params;
  const db = adminDb();

  const { data: d } = await db
    .from("donations")
    .select("id, status, quantity_total, days, per_day_quantity, currency, amount_local, is_classroom, donor_tz, donors(first_name, email)")
    .eq("id", donationId)
    .maybeSingle();
  if (!d) notFound();

  const [{ data: receipt }, { data: tip }, { data: gift }, { data: ded }, { data: firstDay }] = await Promise.all([
    db.from("receipts").select("number").eq("donation_id", donationId).maybeSingle(),
    db.from("tips").select("amount_local, percent").eq("donation_id", donationId).maybeSingle(),
    db.from("gifts").select("recipient_name").eq("donation_id", donationId).maybeSingle(),
    db.from("dedications").select("kind, name").eq("donation_id", donationId).maybeSingle(),
    db.from("donation_days").select("deliveries(status, scheduled_at)").eq("donation_id", donationId).eq("day_index", 1).maybeSingle(),
  ]);

  const currency = d.currency as Currency;
  const qty = d.quantity_total as number;
  const childWord = qty === 1 ? "child" : "children";
  const tipLocal = (tip?.amount_local as number) ?? 0;
  const delivery = (firstDay?.deliveries as unknown as { status: string; scheduled_at: string | null } | null) ?? null;
  const paid = d.status === "paid";

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-xl px-5 py-12">
        <Link href="/" className="timestamp inline-flex min-h-[44px] items-center text-ink/50 hover:text-clay">
          ← FEEDSOMEONE
        </Link>

        {paid && <p className="timestamp mt-6 text-clay">A MEAL IS ON ITS WAY ·</p>}
        <h1 className="mt-2 display text-[clamp(38px,8vw,66px)] leading-[0.92] tracking-[-0.02em]">
          {paid ? (
            <>You fed {countWords(qty)} {childWord}<span className="text-clay">.</span></>
          ) : (
            <>Almost there…</>
          )}
        </h1>

      {receipt?.number && (
        <p className="timestamp mt-3 text-ink/60">RECEIPT {receipt.number} · EMAILED TO {(d.donors as unknown as { email: string }).email.toUpperCase()}</p>
      )}

      <div className="mt-6">
        <StatusPanel
          donationId={donationId}
          initial={{
            status: d.status as string,
            receipt: (receipt?.number as string) ?? null,
            delivery: delivery ? { status: delivery.status, scheduledLabel: null } : null,
          }}
        />
      </div>

      {/* the order, plainly */}
      <div className="mt-6 border border-line p-5">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt>
              Meals — {qty} {childWord}
              {(d.days as number) > 1 ? ` (${d.per_day_quantity}/day × ${d.days} days)` : ""}
              {d.is_classroom ? " · one classroom" : ""}
            </dt>
            <dd className="tabular-nums">{formatMoney(d.amount_local as number, currency)}</dd>
          </div>
          {tipLocal > 0 && (
            <div className="flex justify-between text-ink/70">
              <dt>Tip ({tip?.percent}%)</dt>
              <dd className="tabular-nums">{formatMoney(tipLocal, currency)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney((d.amount_local as number) + tipLocal, currency)}</dd>
          </div>
        </dl>
        <p className="mt-3 inline-block border border-leaf/40 bg-[#eef3ec] px-3 py-1.5 text-[13px] text-leaf">
          100% of {formatMoney(d.amount_local as number, currency)} feeds children. The tip is accounted separately.
        </p>
      </div>

      {(d.days as number) > 1 && (
        <p className="mt-4 text-[15px] text-ink/75">
          One email a day for <b>{d.days} days</b>, each with that day's {d.per_day_quantity} photo{(d.per_day_quantity as number) > 1 ? "s" : ""} —
          delivered at the minute the earliest meal was served.
        </p>
      )}
      {ded && (
        <p className="mt-4 text-[15px] italic text-ink/75">
          In {ded.kind === "memory" ? "memory" : "honor"} of {ded.name} — on the receipt and in every photo email.
        </p>
      )}
      {gift && (
        <p className="mt-4 text-[15px] text-ink/75">
          We've told <b>{gift.recipient_name}</b>. The photo goes to them; the receipt stays with you.
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/donate" className="inline-flex min-h-[48px] items-center bg-clay px-5 font-bold text-paper hover:bg-clay-deep transition-colors">
          Feed another →
        </Link>
        <Link href="/portal" className="inline-flex min-h-[48px] items-center border border-line px-5 hover:border-ink/50 transition-colors">
          Your photos
        </Link>
      </div>

      <p className="timestamp mt-10 text-ink/40">
        TELL ONE PERSON. THAT'S HOW {qty === 1 ? "ONE CHILD" : `${qty} CHILDREN`} BECOMES A THOUSAND.
      </p>
      </div>
    </main>
  );
}
