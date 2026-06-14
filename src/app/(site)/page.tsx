import Link from "next/link";
import { headers } from "next/headers";
import { adminDb } from "@/lib/supabase/server";
import { countryFromHeaders, resolveCurrency } from "@/lib/geo";
import { fmtTime } from "@/lib/deliver";
import HeroCanvas from "@/components/landing/HeroCanvas";
import HowItWorks from "@/components/landing/HowItWorks";
import StatsBand from "@/components/landing/StatsBand";
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

      {/* ── hero stage — warm WebGL light behind masthead + hero ─────────── */}
      <div className="relative isolate overflow-hidden">
        <HeroCanvas className="pointer-events-none absolute inset-0 -z-10" />

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
        <div className="pt-9 pb-10 lg:pt-14 lg:pb-16">
          <h1 className="display text-[clamp(48px,11vw,122px)]">
            Feed one child<br /><span className="text-clay">right now.</span>
          </h1>
          <div className="mt-10 grid gap-y-10 lg:grid-cols-[1fr_0.82fr] lg:items-end lg:gap-x-14">
            <div>
            <p className="max-w-md text-[19px] leading-[1.5] text-ink/70">
              A kitchen near the child cooks a hot meal and takes a photo while they eat.
              It reaches your inbox at the same time of day it happened.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <HeroCTA initialCurrency={currency} />
              <Link href="/donate?qty=5" className="timestamp text-ink/55 underline-offset-4 hover:text-clay hover:underline">
                or feed five →
              </Link>
            </div>
            <p className="timestamp mt-5 text-ink/40">
              <LocalPrice initialCurrency={currency} /> feeds one child. we keep nothing.
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
                  <span>{hero.city || "New Delhi"}</span>
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
      </div>

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
                  <figcaption className="mt-2.5 text-[14px] text-ink/65">
                    {p.city || "New Delhi"}
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

      {/* ── the why — india child hunger ────────────────────────────────── */}
      <section className="border-t border-ink/10 py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="max-w-3xl">
            <p className="timestamp text-clay">Why we do this · India</p>
            <h2 className="mt-3 display text-[clamp(34px,6vw,64px)]">Most of the world&apos;s hungry children are here.</h2>
            <p className="mt-6 max-w-xl text-[18px] leading-[1.55] text-ink/70">
              India has more underfed children than any country in the world. There is enough food.
              It just doesn&apos;t reach them. ₹25 puts a hot meal in front of one of them today.
            </p>
          </div>
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "1 in 3", t: "children under five are stunted from chronic hunger", s: "NFHS-5, 2021" },
              { n: "20M", t: "are severely malnourished, nearly half the world's total", s: "UNICEF, 2024" },
              { n: "67%", t: "of young children are anaemic", s: "NFHS-5, 2021" },
              { n: "102/123", t: "on the 2025 Global Hunger Index, rated serious", s: "GHI, 2025" },
            ].map((x) => (
              <div key={x.n}>
                <div className="display text-[clamp(40px,6.5vw,68px)] leading-none text-clay">{x.n}</div>
                <p className="mt-3.5 text-[15px] leading-snug text-ink/70">{x.t}</p>
                <p className="timestamp mt-2 text-ink/35">{x.s}</p>
              </div>
            ))}
          </div>
          <p className="mt-16 max-w-2xl display text-[clamp(24px,4vw,42px)] leading-[1.05]">
            <span className="text-clay">&#8377;25</span> buys one child a hot meal. That&apos;s all this is.
          </p>
        </div>
      </section>

      {/* ── what lands in your inbox ─────────────────────────────────────── */}
      {hero && (
        <section className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
          <div className="grid items-center gap-y-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-x-16">
            <div className="lg:order-2">
              <p className="timestamp text-clay">What you get back</p>
              <h2 className="mt-3 display text-[clamp(32px,5.5vw,60px)]">You see the meal happen.</h2>
              <p className="mt-6 max-w-md text-[18px] leading-[1.55] text-ink/70">
                A few hours after you give, an email arrives. It is one photo: the child
                eating the meal you paid for, at the kitchen, sent at the same time of day
                it was taken. No newsletter, no annual report. Just the moment.
              </p>
              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 max-w-md">
                {[["Who", "The child who ate"], ["What", "A hot plate of dal, rice and roti"], ["Where", "The kitchen we work with"], ["When", "The minute it happened, your time"]].map(([t, b]) => (
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
                  <div className="text-[15px] leading-tight">A meal you paid for</div>
                  <div className="timestamp mt-1 text-ink/45">{hero.city || "New Delhi"}</div>
                </figcaption>
              </div>
              <p className="timestamp mt-4 text-center text-ink/40">sent at {fmtTime(hero.takenAt, hero.tz)}, the same time of day it happened</p>
            </figure>
          </div>
        </section>
      )}

      {/* ── how it works ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="grid gap-y-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-x-16">
          <div>
            <p className="timestamp text-clay">HOW IT WORKS</p>
            <h2 className="mt-3 display text-[clamp(34px,6vw,68px)]">What happens after you give.</h2>
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
            <h2 className="mt-3 display text-[clamp(38px,7vw,80px)]">We&apos;ve done<br />this before.</h2>
            <p className="mt-7 max-w-md text-[18px] leading-[1.55] text-ink/70">
              Between 2014 and 2018, FeedSomeone served <b className="text-ink">eighteen million meals</b> to
              children across India. Then it stopped. We&apos;ve rebuilt it from scratch for 2026, with the
              proof of every meal built into how it works.
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
            <h2 className="mt-3 display text-[clamp(32px,5.5vw,60px)]">We check every meal that goes out.</h2>
          </div>
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: "01", t: "Kitchen GPS", b: "Every photo is checked against the kitchen's location, so a meal can only be logged where it was actually served." },
              { k: "02", t: "Timestamps", b: "Each photo carries the moment it was taken, the same minute it reaches you. That is hard to fake." },
              { k: "03", t: "Privacy first", b: "We can blur a child's face in one tap, and we flag any photo that has been used before." },
              { k: "04", t: "Numbered receipts", b: "Every donation gets a numbered, dated receipt. All of it goes to meals. Nothing goes to us." },
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
