import { redirect } from "next/navigation";
import Link from "next/link";
import { adminDb, serverClient } from "@/lib/supabase/server";
import { formatMoney, isCurrency } from "@/lib/money";
import { fmtTaken, fmtTime } from "@/lib/deliver";
import { signOut } from "./actions";
import SubscriptionControls from "./SubscriptionControls";

export const dynamic = "force-dynamic";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function statusChip(status: string) {
  const styles: Record<string, string> = {
    paid: "bg-leaf/10 border-leaf/30 text-leaf",
    delivered: "bg-leaf/10 border-leaf/30 text-leaf",
    pending: "bg-sand border-line text-ink/50",
    waiting: "bg-sand border-line text-ink/50",
    scheduled: "bg-marigold/10 border-marigold/40 text-marigold",
    failed: "bg-clay/10 border-clay/30 text-clay",
    refunded: "bg-sand border-line text-ink/40",
  };
  const cls = styles[status] ?? "bg-sand border-line text-ink/50";
  return (
    <span
      className={`timestamp text-[10px] px-2 py-0.5 border inline-block ${cls}`}
    >
      {status.toUpperCase()}
    </span>
  );
}

function dayLabel(scheduledAt: string, donorTz: string | null): string {
  const tz = donorTz ?? "UTC";
  const d = new Date(scheduledAt);
  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const targetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const todayStr = `${todayParts.find((p) => p.type === "year")?.value}-${todayParts.find((p) => p.type === "month")?.value}-${todayParts.find((p) => p.type === "day")?.value}`;
  const targetStr = `${targetParts.find((p) => p.type === "year")?.value}-${targetParts.find((p) => p.type === "month")?.value}-${targetParts.find((p) => p.type === "day")?.value}`;

  if (todayStr === targetStr) return "Today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tmrParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tomorrow);
  const tmrStr = `${tmrParts.find((p) => p.type === "year")?.value}-${tmrParts.find((p) => p.type === "month")?.value}-${tmrParts.find((p) => p.type === "day")?.value}`;
  if (targetStr === tmrStr) return "Tomorrow";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export default async function PortalPage() {
  /* ── auth ──────────────────────────────────────────────────────────────── */
  const supa = await serverClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) redirect("/portal/login");

  const email = user.email ?? "";
  const db = adminDb();

  /* ── donor lookup + lazy user_id link ─────────────────────────────────── */
  const { data: donor } = await db
    .from("donors")
    .select("id, first_name, user_id, donor_tz")
    .eq("email", email)
    .maybeSingle();

  if (!donor) {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <div className="mx-auto max-w-xl px-5 pt-10 pb-16">
          <Link
            href="/"
            className="font-[family-name:var(--font-fraunces)] font-black text-xl tracking-tight"
          >
            FeedSomeone<span className="text-clay">.</span>
          </Link>
          <div className="mt-12 border border-line bg-sand p-8">
            <h1 className="font-[family-name:var(--font-fraunces)] font-black text-3xl">
              No meals yet under this email.
            </h1>
            <p className="mt-3 text-[15px] text-ink/70 leading-relaxed">
              Fix that in twenty seconds.
            </p>
            <Link
              href="/donate"
              className="mt-6 inline-flex min-h-[56px] items-center bg-clay px-7 text-lg font-bold text-paper hover:bg-clay-deep transition-colors"
            >
              Feed one child · ₹25 →
            </Link>
          </div>
          <form action={signOut} className="mt-8">
            <button
              type="submit"
              className="timestamp text-ink/40 hover:text-clay underline-offset-4 hover:underline min-h-[44px] inline-flex items-center text-xs"
            >
              SIGN OUT
            </button>
          </form>
        </div>
      </main>
    );
  }

  /* Lazy link: if donor exists but user_id is null, stamp it */
  if (!donor.user_id) {
    await db.from("donors").update({ user_id: user.id }).eq("id", donor.id);
  }

  const donorId = donor.id;
  const donorTz = (donor.donor_tz as string | null) ?? "UTC";
  const firstName = (donor.first_name as string | null) ?? null;

  /* ── gallery: photo assignments ───────────────────────────────────────── */
  const { data: assignments } = await db
    .from("photo_assignments")
    .select(
      "id, photos(id, storage_path, blurred_path, taken_at, tz, kitchens(name, city))",
    )
    .eq("donor_id", donorId)
    .order("created_at", { ascending: false })
    .limit(40);

  type PhotoRow = {
    assignId: string;
    url: string;
    takenLabel: string;
    kitchen: string;
    city: string;
  };

  const gallery: PhotoRow[] = [];
  for (const a of assignments ?? []) {
    const ph = a.photos as unknown as {
      id: string;
      storage_path: string;
      blurred_path: string | null;
      taken_at: string;
      tz: string;
      kitchens: { name: string; city: string } | null;
    } | null;
    if (!ph) continue;
    const path = ph.blurred_path ?? ph.storage_path;
    const { data: signed } = await db.storage
      .from("photos")
      .createSignedUrl(path, 3600);
    if (!signed?.signedUrl) continue;
    gallery.push({
      assignId: a.id as string,
      url: signed.signedUrl,
      takenLabel: fmtTaken(new Date(ph.taken_at as string), ph.tz as string),
      kitchen: ph.kitchens?.name ?? "Partner kitchen",
      city: ph.kitchens?.city ?? "",
    });
  }

  /* ── upcoming deliveries ──────────────────────────────────────────────── */
  type DeliveryItem = {
    id: string;
    status: string;
    scheduled_at: string | null;
    donation_days: {
      day_index: number;
      donations: { days: number };
    } | null;
  };

  const { data: upcomingRaw } = await db
    .from("deliveries")
    .select(
      "id, status, scheduled_at, donation_days(day_index, donations(days))",
    )
    .eq("donor_id", donorId)
    .in("status", ["waiting", "scheduled"])
    .order("scheduled_at", { ascending: true })
    .limit(10);

  const upcoming = (upcomingRaw ?? []) as unknown as DeliveryItem[];

  /* ── donations ────────────────────────────────────────────────────────── */
  type DonationRow = {
    id: string;
    currency: string;
    amount_local: number;
    quantity_total: number;
    days: number;
    paid_at: string | null;
    status: string;
    receipts: Array<{ number: string }> | null;
    tips: Array<{ amount_local: number }> | null;
  };

  const { data: donationsRaw } = await db
    .from("donations")
    .select(
      "id, currency, amount_local, quantity_total, days, paid_at, status, receipts(number), tips(amount_local)",
    )
    .eq("donor_id", donorId)
    .order("created_at", { ascending: false })
    .limit(50);

  const donations = (donationsRaw ?? []) as unknown as DonationRow[];

  /* ── subscriptions ────────────────────────────────────────────────────── */
  type SubRow = {
    id: string;
    cadence: string | null;
    quantity: number;
    amount_local: number;
    currency: string;
    status: string;
    provider_sub_id: string | null;
  };

  const { data: subsRaw } = await db
    .from("subscriptions")
    .select(
      "id, cadence, quantity, amount_local, currency, status, provider_sub_id",
    )
    .eq("donor_id", donorId)
    .order("created_at", { ascending: false });

  const subs = (subsRaw ?? []) as unknown as SubRow[];

  /* ── render ───────────────────────────────────────────────────────────── */
  return (
    <main className="grain min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-4xl px-5 pt-8 pb-20">
        {/* ── nav ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="font-[family-name:var(--font-fraunces)] font-black text-xl tracking-tight"
          >
            FeedSomeone<span className="text-clay">.</span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="timestamp text-ink/40 hover:text-clay underline-offset-4 hover:underline min-h-[44px] inline-flex items-center text-xs"
            >
              SIGN OUT
            </button>
          </form>
        </div>

        <p className="mt-5 text-[15px] text-ink/60">
          {firstName ? `${firstName} · ` : ""}
          <span className="timestamp">{email}</span>
        </p>

        {/* ─────────────────────────────────────────────────────────────── */}
        {/* A · GALLERY                                                      */}
        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mt-10">
          <p className="timestamp text-clay text-[11px] tracking-widest">
            YOUR PHOTOS
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-fraunces)] font-black text-3xl sm:text-4xl leading-tight tracking-tight">
            The minutes you<br />made happen<span className="text-clay">.</span>
          </h2>

          {gallery.length === 0 ? (
            <div className="mt-6 border border-line bg-sand p-8 text-center">
              <p className="text-[15px] text-ink/70 leading-relaxed">
                Your first photo will land here the minute a kitchen serves a meal you paid for.
              </p>
              <p className="mt-4 timestamp text-ink/40 text-[11px]">
                CHECK BACK SOON
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {gallery.map((ph) => (
                <figure key={ph.assignId}>
                  <div className="print print-hover">
                    <div className="relative aspect-square overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ph.url} alt="A meal moment" />
                    </div>
                  </div>
                  <figcaption className="mt-2 space-y-0.5 px-0.5">
                    <div className="timestamp text-[10px] leading-tight text-ink/50">
                      {ph.takenLabel}
                    </div>
                    <div className="text-[12px] leading-tight text-ink/70">
                      {ph.kitchen}
                      {ph.city ? `, ${ph.city}` : ""}
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        {/* B · UPCOMING                                                     */}
        {/* ─────────────────────────────────────────────────────────────── */}
        {upcoming.length > 0 && (
          <section className="mt-14">
            <p className="timestamp text-clay text-[11px] tracking-widest">
              COMING UP
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-fraunces)] font-black text-2xl tracking-tight">
              Meals on the way.
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {upcoming.map((d) => {
                const day = d.donation_days;
                const dayIdx = day?.day_index ?? null;
                const daysTotal = day?.donations?.days ?? null;

                return (
                  <div
                    key={d.id}
                    className="border border-line bg-sand/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      {dayIdx !== null && daysTotal !== null && (
                        <div className="timestamp text-ink/40 text-[10px] mb-1">
                          DAY {dayIdx} OF {daysTotal}
                        </div>
                      )}
                      <div className="text-[14px]">
                        {d.status === "waiting" ? (
                          <span className="text-ink/60">
                            Waiting for a kitchen — usually under a day
                          </span>
                        ) : d.scheduled_at ? (
                          <span>
                            Arrives{" "}
                            <b>
                              {fmtTime(
                                new Date(d.scheduled_at),
                                donorTz,
                              )}
                            </b>{" "}
                            your time ·{" "}
                            <span className="text-ink/60">
                              {dayLabel(d.scheduled_at, donorTz)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-ink/60">Scheduled</span>
                        )}
                      </div>
                    </div>
                    {statusChip(d.status)}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─────────────────────────────────────────────────────────────── */}
        {/* C · DONATIONS                                                    */}
        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mt-14">
          <p className="timestamp text-clay text-[11px] tracking-widest">
            YOUR GIVING
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-fraunces)] font-black text-2xl tracking-tight">
            Every donation.
          </h2>

          {donations.length === 0 ? (
            <div className="mt-4 border border-line bg-sand/60 p-6 text-center text-[15px] text-ink/60">
              No donations yet.{" "}
              <Link href="/donate" className="text-clay underline-offset-4 hover:underline">
                Start here →
              </Link>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {donations.map((don) => {
                const currency = isCurrency(don.currency) ? don.currency : "INR";
                const receiptNum =
                  Array.isArray(don.receipts) && don.receipts.length
                    ? (don.receipts[0] as { number: string }).number
                    : null;
                const tipLocal =
                  Array.isArray(don.tips) && don.tips.length
                    ? (don.tips[0] as { amount_local: number }).amount_local
                    : null;

                return (
                  <div
                    key={don.id}
                    className="border border-line bg-paper p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        {receiptNum && (
                          <div className="timestamp text-ink text-[11px]">
                            {receiptNum}
                          </div>
                        )}
                        <div className="timestamp text-ink/40 text-[10px]">
                          {don.paid_at
                            ? new Date(don.paid_at).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </div>
                        <div className="text-[13px] text-ink/70">
                          {don.quantity_total}{" "}
                          {don.quantity_total === 1 ? "child" : "children"}
                          {don.days > 1 ? ` × ${don.days} days` : ""}
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="text-[14px] font-semibold">
                          {formatMoney(don.amount_local, currency)}
                          <span className="text-ink/40 text-[11px] font-normal ml-1">
                            meals
                          </span>
                        </div>
                        {tipLocal != null && tipLocal > 0 && (
                          <div className="text-[13px] text-ink/60">
                            {formatMoney(tipLocal, currency)}
                            <span className="text-ink/40 text-[11px] ml-1">
                              tip
                            </span>
                          </div>
                        )}
                        {statusChip(don.status)}
                      </div>
                    </div>
                    {receiptNum && (
                      <a
                        href={`/api/receipts/${encodeURIComponent(receiptNum)}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="timestamp mt-3 inline-flex min-h-[36px] items-center text-[10px] text-ink/50 hover:text-clay underline-offset-4 hover:underline"
                      >
                        RECEIPT PDF ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        {/* D · SCHEDULES                                                    */}
        {/* ─────────────────────────────────────────────────────────────── */}
        {subs.length > 0 && (
          <section className="mt-14">
            <p className="timestamp text-clay text-[11px] tracking-widest">
              RECURRING SCHEDULES
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-fraunces)] font-black text-2xl tracking-tight">
              Children fed on schedule.
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {subs.map((sub) => {
                const currency = isCurrency(sub.currency) ? sub.currency : "INR";
                return (
                  <SubscriptionControls
                    key={sub.id}
                    sub={{
                      id: sub.id,
                      cadence: sub.cadence,
                      qty: sub.quantity,
                      amountFmt: formatMoney(sub.amount_local, currency),
                      status: sub.status,
                    }}
                  />
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
