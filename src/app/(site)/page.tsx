import Link from "next/link";
import { headers } from "next/headers";
import { adminDb } from "@/lib/supabase/server";
import { countryFromHeaders, resolveCurrency } from "@/lib/geo";
import { fmtTime } from "@/lib/deliver";
import LiveCounter from "@/components/landing/LiveCounter";
import HowItWorks from "@/components/landing/HowItWorks";
import StatsBand from "@/components/landing/StatsBand";
import LocalClock from "@/components/landing/LocalClock";
import HeroCTA from "@/components/checkout/HeroCTA";
import LocalPrice from "@/components/checkout/LocalPrice";
import QuickDonate from "@/components/checkout/QuickDonate";

export const dynamic = "force-dynamic";

type RecentPhoto = {
  id: string; url: string; takenAt: Date; tz: string; city: string; donorName: string;
};

function donorDisplay(first: string | null | undefined, anonymous: boolean | null | undefined): string {
  const name = (first ?? "").trim();
  if (!name || anonymous) return "Someone";
  return name.length > 10 ? name.slice(0, 10) : name;
}

async function loadRecent(): Promise<RecentPhoto[]> {
  try {
    const db = adminDb();
    const { data } = await db
      .from("photos")
      .select("id, storage_path, blurred_path, taken_at, tz, kitchens(city), photo_assignments(donors(first_name, is_anonymous))")
      .eq("status", "delivered")
      .order("taken_at", { ascending: false })
      .limit(9);
    const out: RecentPhoto[] = [];
    for (const p of data ?? []) {
      const path = (p.blurred_path as string | null) ?? (p.storage_path as string);
      const { data: signed } = await db.storage.from("photos").createSignedUrl(path, 3600);
      if (!signed?.signedUrl) continue;
      const pa = (p.photo_assignments as unknown as Array<{ donors: { first_name: string | null; is_anonymous: boolean | null } | null }>)?.[0];
      out.push({
        id: p.id as string,
        url: signed.signedUrl,
        takenAt: new Date(p.taken_at as string),
        tz: p.tz as string,
        city: (p.kitchens as unknown as { city: string } | null)?.city ?? "",
        donorName: donorDisplay(pa?.donors?.first_name, pa?.donors?.is_anonymous),
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function loadStats(): Promise<{ fed_today: number; total_meals: number; total_donors: number; kitchens: number }> {
  try {
    const { data } = await adminDb().rpc("get_public_stats");
    return { fed_today: 0, total_meals: 0, total_donors: 0, kitchens: 0, ...(data as object) };
  } catch {
    return { fed_today: 0, total_meals: 0, total_donors: 0, kitchens: 0 };
  }
}

export default async function Landing() {
  const h = await headers();
  const currency = resolveCurrency(countryFromHeaders(h), null);

  const [stats, recent] = await Promise.all([loadStats(), loadRecent()]);
  const hero = recent[0] ?? null;
  const strip = recent.slice(1);
  const showNumbers =
    stats.total_meals >= Number(process.env.STATS_MIN_MEALS ?? 500) &&
    stats.total_donors >= Number(process.env.STATS_MIN_DONORS ?? 100);

  return (
    <main className="bg-paper text-ink">
      <QuickDonate initialCurrency={currency} />

      {/* ── masthead ─────────────────────────────────────────────────────── */}
      <header className="mx-auto max-w-6xl px-5 pt-5">
        <div className="flex items-end justify-between pb-3">
          <span className="display text-xl leading-none">FeedSomeone<span className="text-clay">.</span></span>
          <Link href="/portal" className="timestamp text-ink/55 hover:text-clay">Your photos</Link>
        </div>
        <div className="rule" />
      </header>

      {/* ── hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5">
          <LiveCounter initial={stats.fed_today} />
          <span className="timestamp text-ink/45">Right now where you are · <LocalClock /></span>
        </div>
        <div className="hair" />

        <div className="py-10 lg:py-16">
          <h1 className="display text-[clamp(48px,11vw,122px)]">
            Feed one child<br /><span className="text-clay">right now.</span>
          </h1>
          <div className="mt-10 grid gap-y-10 lg:grid-cols-[1fr_0.82fr] lg:items-end lg:gap-x-14">
            <div>
            <p className="max-w-md text-[19px] leading-[1.5] text-ink/70">
              A partner kitchen cooks it, serves a child, and photographs the moment.
              The photo reaches your inbox — at the exact minute it was taken.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <HeroCTA initialCurrency={currency} />
              <Link href="/donate?qty=5" className="timestamp text-ink/55 underline-offset-4 hover:text-clay hover:underline">
                or feed five →
              </Link>
            </div>
            <p className="timestamp mt-5 text-ink/40">
              <LocalPrice initialCurrency={currency} /> · one meal · one photo · no admin fee
            </p>
          </div>

          {/* the photograph — straight, plain, large */}
          <figure className="self-end">
            {hero ? (
              <>
                <div className="photo aspect-[4/5] border border-ink/15">
                  {/* signed URLs expire hourly — plain img, not next/image cache */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={hero.url} alt="A child eating a meal a donor paid for" />
                  <span className="photo-stamp">{fmtTime(hero.takenAt, hero.tz)}</span>
                </div>
                <figcaption className="mt-3 flex items-baseline justify-between gap-3 text-[15px]">
                  <span>Fed by <b>{hero.donorName}</b>{hero.city ? ` in ${hero.city}` : ""}</span>
                  <span className="timestamp text-ink/45">
                    {hero.takenAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: hero.tz })}
                  </span>
                </figcaption>
              </>
            ) : (
              <div className="photo flex aspect-[4/5] flex-col items-center justify-center border border-ink/15 p-8 text-center">
                <p className="timestamp text-clay">The first photo lands here today</p>
                <p className="mt-3 max-w-xs text-[15px] text-ink/65">
                  Our kitchens are tying their aprons. Donate now and the very first meal photo could be yours.
                </p>
              </div>
            )}
          </figure>
          </div>
        </div>
      </section>

      {/* ── recently fed ─────────────────────────────────────────────────── */}
      <section className="border-y border-ink/10 bg-sand/45 py-12">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between px-5">
          <h2 className="display text-2xl sm:text-3xl">Recently fed</h2>
          <span className="timestamp flex items-center gap-2 text-ink/45">
            <span className="h-1.5 w-1.5 rounded-full bg-clay" />by donors like you
          </span>
        </div>
        <div className="no-bar mt-7 overflow-x-auto">
          <div className="mx-auto flex max-w-6xl gap-4 px-5">
            {strip.length ? (
              strip.map((p) => (
                <figure key={p.id} className="lift w-52 flex-none sm:w-56">
                  <div className="photo aspect-[4/5] border border-ink/12">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="A meal moment" />
                    <span className="photo-stamp">{fmtTime(p.takenAt, p.tz)}</span>
                  </div>
                  <figcaption className="mt-2.5 text-[14px]">
                    <b>{p.donorName}</b>{p.city ? ` · ${p.city}` : ""}
                  </figcaption>
                </figure>
              ))
            ) : (
              <div className="w-full px-5 py-6 text-[15px] text-ink/55">
                The first photos arrive when kitchens open — be the donor who triggers one.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── what lands in your inbox ─────────────────────────────────────── */}
      {hero && (
        <section className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <div className="grid items-center gap-y-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-x-16">
            <div className="lg:order-2">
              <p className="timestamp text-clay">What lands in your inbox</p>
              <h2 className="mt-3 display text-[clamp(32px,5.5vw,60px)]">Not a thank-you note.<br />The actual moment.</h2>
              <p className="mt-6 max-w-md text-[18px] leading-[1.55] text-ink/70">
                Mid-afternoon, while you&apos;re at your desk, an email arrives. One photo —
                the child you fed, the plate in their hands, the kitchen behind them,
                stamped with the exact minute it happened. You see who, what, where, and when.
              </p>
              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 max-w-md">
                {[["Who you fed", "A real child, by name of kitchen"], ["What they ate", "A hot plate — dal, rice, chapati"], ["Where", "The verified partner kitchen"], ["When", "The exact minute, your timezone"]].map(([t, b]) => (
                  <div key={t}>
                    <dt className="timestamp text-ink/40">{t}</dt>
                    <dd className="mt-1 text-[14px] leading-snug text-ink/70">{b}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* the card — the real email, framed like a phone-less product shot */}
            <figure className="lg:order-1 mx-auto w-full max-w-sm">
              <div className="border border-ink/12 bg-paper p-3 shadow-[0_30px_80px_-40px_rgba(26,15,10,0.5)]">
                <div className="photo aspect-[4/5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={hero.url} alt="The photo a donor receives" />
                  <span className="photo-stamp">{fmtTime(hero.takenAt, hero.tz)}</span>
                </div>
                <figcaption className="px-1 pt-3.5 pb-1">
                  <div className="text-[15px] leading-tight">Fed by <b>{hero.donorName}</b></div>
                  <div className="timestamp mt-1 text-ink/45">{hero.city || "New Delhi"} · a meal you paid for</div>
                </figcaption>
              </div>
              <p className="timestamp mt-4 text-center text-ink/40">delivered at {fmtTime(hero.takenAt, hero.tz)} — the same minute it was taken</p>
            </figure>
          </div>
        </section>
      )}

      {/* ── how it works ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="grid gap-y-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-x-16">
          <div>
            <p className="timestamp text-clay">HOW IT WORKS</p>
            <h2 className="mt-3 display text-[clamp(34px,6vw,68px)]">Four steps. One real minute.</h2>
          </div>
          <div className="max-w-xl lg:pt-2"><HowItWorks /></div>
        </div>
      </section>

      {/* ── stats band ───────────────────────────────────────────────────── */}
      <StatsBand
        showNumbers={showNumbers}
        stats={[
          { label: "meals served", value: stats.total_meals },
          { label: "donors", value: stats.total_donors },
          { label: "partner kitchens", value: stats.kitchens },
        ]}
      />

      {/* ── heritage — the return ────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <div className="grid items-center gap-y-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-x-16">
          <div>
            <p className="timestamp text-clay">Since 2014</p>
            <h2 className="mt-3 display text-[clamp(38px,7vw,80px)]">This isn&apos;t new.<br />It&apos;s a return.</h2>
            <p className="mt-7 max-w-md text-[18px] leading-[1.55] text-ink/70">
              FeedSomeone served <b className="text-ink">eighteen million meals</b> to children across India —
              then paused in 2018. A decade of proof. Today it&apos;s back, rebuilt from nothing for 2026:
              every meal geo-verified, timestamped, and photographed to the minute.
            </p>
          </div>
          <div className="lg:text-right">
            <div className="display text-[clamp(88px,18vw,200px)] leading-[0.8] text-clay">18M</div>
            <p className="timestamp mt-3 text-ink/45">meals served · 2014–2018 · across India</p>
          </div>
        </div>
      </section>

      {/* ── verification — how we keep it honest ─────────────────────────── */}
      <section className="border-t border-ink/10 bg-sand/40 py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-3xl">
            <p className="timestamp text-clay">How we keep it honest</p>
            <h2 className="mt-3 display text-[clamp(32px,5.5vw,60px)]">Every meal is verified. Fraud stays near zero.</h2>
          </div>
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: "01", t: "Geo-fenced kitchens", b: "Every photo is checked against the kitchen's registered GPS. A meal can only be logged where it is actually served." },
              { k: "02", t: "Timestamped to the minute", b: "Each photo carries the exact moment it was taken — the same minute it lands in your inbox. Time can't be faked." },
              { k: "03", t: "Privacy-first faces", b: "Face detection protects every child — one tap blurs identities, and duplicate-photo detection flags any reuse." },
              { k: "04", t: "Numbered receipts", b: "Every donation gets a sequential, dated FS-receipt. 100% goes to meals — the books are open by design." },
            ].map((p) => (
              <div key={p.k}>
                <div className="timestamp text-ink/30">{p.k}</div>
                <h3 className="mt-2 display text-[22px]">{p.t}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink/65">{p.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── sign-off — feed someone, loud ────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <p className="timestamp text-clay">No one should eat alone</p>
        <p className="mt-4 display text-[clamp(64px,17vw,232px)] leading-[0.82]">
          Feed<br />someone<span className="text-clay">.</span>
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
          <Link
            href="/donate"
            className="inline-flex min-h-[58px] items-center bg-ink px-8 text-lg font-bold text-paper transition-colors hover:bg-clay"
          >
            Feed one child →
          </Link>
          <span className="timestamp text-ink/50">
            100% of every donation feeds children · <a className="hover:text-clay" href="mailto:hello@feedsomeone.org">hello@feedsomeone.org</a>
          </span>
        </div>
      </section>

      {/* ── footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-ink/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link className="inline-flex min-h-[44px] items-center hover:text-clay" href="/donate">Donate</Link>
            <Link className="inline-flex min-h-[44px] items-center hover:text-clay" href="/portal">Your photos</Link>
            <Link className="inline-flex min-h-[44px] items-center hover:text-clay" href="/kitchens">Partner kitchens</Link>
            <Link className="inline-flex min-h-[44px] items-center hover:text-clay" href="/kitchen/login">Kitchen login</Link>
          </nav>
          <p className="timestamp text-ink/40">Every photo carries its minute. Time is the product.</p>
        </div>
      </footer>
    </main>
  );
}
