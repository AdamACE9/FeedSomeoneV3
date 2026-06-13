import Link from "next/link";
import { headers } from "next/headers";
import { adminDb } from "@/lib/supabase/server";
import { countryFromHeaders, resolveCurrency } from "@/lib/geo";
import { fmtTime } from "@/lib/deliver";
import LiveCounter from "@/components/landing/LiveCounter";
import HowItWorks from "@/components/landing/HowItWorks";
import StatsBand from "@/components/landing/StatsBand";
import Reveal from "@/components/landing/Reveal";
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
      .limit(10);
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
  const behind = recent.slice(1, 3); // prints peeking behind the hero
  const showNumbers =
    stats.total_meals >= Number(process.env.STATS_MIN_MEALS ?? 500) &&
    stats.total_donors >= Number(process.env.STATS_MIN_DONORS ?? 100);

  return (
    <main className="grain bg-paper text-ink">
      <QuickDonate initialCurrency={currency} />

      {/* ── 1 · first fold — cinematic ───────────────────────────────────── */}
      <section className="stage relative overflow-hidden">
        {/* brand bar */}
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-6">
          <span className="display text-lg tracking-tight">FeedSomeone<span className="text-clay">.</span></span>
          <Link href="/portal" className="timestamp inline-flex min-h-[44px] items-center text-ink/60 underline-offset-4 hover:underline">
            YOUR PHOTOS
          </Link>
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-8 sm:pb-20 sm:pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
          {/* left — the words */}
          <div className="anim-rise">
            <div className="flex flex-wrap items-center gap-3">
              <LiveCounter initial={stats.fed_today} />
              <span className="timestamp inline-flex items-center gap-1.5 text-ink/50">
                <span className="hidden sm:inline">RIGHT NOW WHERE YOU ARE ·</span>
                <LocalClock />
              </span>
            </div>

            <h1 className="mt-6 display text-[clamp(46px,9vw,104px)] leading-[0.9] tracking-[-0.02em]">
              Feed one child
              <br />right<span className="text-clay"> now.</span>
            </h1>

            <p className="mt-5 max-w-md text-[18px] leading-relaxed text-ink/75">
              A partner kitchen cooks it, serves a child, and photographs the moment.
              That photo reaches your inbox — at the exact minute it was taken.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <HeroCTA initialCurrency={currency} />
              <Link href="/donate?qty=5" className="timestamp inline-flex min-h-[44px] items-center text-ink/60 underline-offset-4 hover:text-clay hover:underline">
                OR FEED FIVE →
              </Link>
            </div>
            <p className="timestamp mt-4 text-ink/40">
              <LocalPrice initialCurrency={currency} /> · ONE MEAL · ONE PHOTO · NO ADMIN FEE
            </p>
          </div>

          {/* right — the photo that just arrived */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            {hero ? (
              <div className="relative">
                {/* prints peeking behind */}
                {behind[0] && (
                  <div className="print tilt-r absolute -right-3 -top-4 hidden w-[78%] sm:block" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="relative aspect-[5/4] overflow-hidden"><img src={behind[0].url} alt="" /></div>
                  </div>
                )}
                {behind[1] && (
                  <div className="print tilt-l absolute -left-4 top-6 hidden w-[70%] sm:block" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="relative aspect-[5/4] overflow-hidden"><img src={behind[1].url} alt="" /></div>
                  </div>
                )}

                {/* the hero print */}
                <figure className="anim-float relative" style={{ ["--rot" as string]: "-1.2deg" }}>
                  <div className="print">
                    <div className="relative aspect-[5/4] overflow-hidden">
                      {/* signed URLs expire hourly — plain img, no next/image cache */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={hero.url} alt="A child eating a meal a donor paid for" className="anim-kenburns" />
                    </div>
                    <span className="print-stamp right-4 top-4">{fmtTime(hero.takenAt, hero.tz).toUpperCase()}</span>
                    <span className="absolute left-4 top-4 z-[3] bg-clay px-2 py-1 text-[10px] font-bold tracking-wider text-paper">JUST DELIVERED</span>
                  </div>
                  <figcaption className="mt-3 flex items-baseline justify-between gap-3 px-1">
                    <span className="text-[15px]">Fed by <b>{hero.donorName}</b>{hero.city ? ` in ${hero.city}` : ""}</span>
                    <span className="timestamp text-ink/50">
                      {hero.takenAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: hero.tz })}
                    </span>
                  </figcaption>
                </figure>
              </div>
            ) : (
              <div className="print">
                <div className="flex aspect-[5/4] flex-col items-center justify-center bg-sand p-8 text-center">
                  <p className="timestamp text-clay">THE FIRST PHOTO LANDS HERE TODAY</p>
                  <p className="mt-3 max-w-xs text-[15px] text-ink/70">Our kitchens are tying their aprons. Donate now and the very first meal photo could be yours.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* scroll cue */}
        <div className="pointer-events-none flex justify-center pb-6" aria-hidden>
          <span className="timestamp flex flex-col items-center gap-1 text-ink/35">
            SCROLL
            <span className="h-4 w-px bg-ink/30" style={{ animation: "scrollcue 1.8s ease-in-out infinite" }} />
          </span>
        </div>
      </section>

      {/* ── 2 · carousel — the wall ──────────────────────────────────────── */}
      <section className="border-y border-line bg-sand/50 py-12">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute h-full w-full animate-ping rounded-full bg-clay opacity-50 motion-reduce:hidden" />
              <span className="relative h-2 w-2 rounded-full bg-clay" />
            </span>
            <h2 className="text-sm font-semibold tracking-wide">
              Recently fed <span className="font-normal text-ink/50">· by donors like you</span>
            </h2>
          </div>
        </div>
        <div className="no-bar mt-6 overflow-x-auto pb-3">
          <div className="mx-auto flex max-w-6xl snap-x snap-mandatory gap-5 px-5">
            {recent.length ? (
              recent.map((p, i) => (
                <figure key={p.id} className="w-56 flex-none snap-start">
                  <div className={`print print-hover ${i % 2 ? "tilt-r" : "tilt-l"}`}>
                    <div className="relative aspect-[5/4] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="A meal moment" />
                    </div>
                    <span className="print-stamp right-3 top-3">{fmtTime(p.takenAt, p.tz).toUpperCase()}</span>
                  </div>
                  <figcaption className="mt-2.5 px-1">
                    <div className="text-[13px]"><b>{p.donorName}</b>{p.city ? ` · in ${p.city}` : ""}</div>
                  </figcaption>
                </figure>
              ))
            ) : (
              <div className="w-full border border-dashed border-line bg-paper px-6 py-8 text-center text-[15px] text-ink/60">
                The first photos arrive when kitchens open — be the donor who triggers one.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 3 · how it works ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <Reveal>
          <p className="timestamp text-clay">HOW IT WORKS</p>
          <h2 className="mt-2 mb-12 display text-[clamp(30px,5vw,52px)] leading-[0.95]">
            Four steps. One real minute.
          </h2>
        </Reveal>
        <div className="max-w-2xl"><HowItWorks /></div>
      </section>

      {/* ── 4 · stats band ───────────────────────────────────────────────── */}
      <StatsBand
        showNumbers={showNumbers}
        stats={[
          { label: "meals served", value: stats.total_meals },
          { label: "donors", value: stats.total_donors },
          { label: "partner kitchens", value: stats.kitchens },
        ]}
      />

      {/* ── 5 · team ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <p className="timestamp text-clay">THE TEAM BEHIND FEEDSOMEONE</p>
          <div className="mt-6 grid max-w-3xl gap-6 sm:grid-cols-2">
            {[
              { initials: "DA", name: "Danish Ahmed", role: "Co-founder · Operations & Kitchens", bio: "Builds the kitchen network and runs every plate from stove to photo. If a child ate, Danish knows which kitchen, which city, which minute." },
              { initials: "AA", name: "Adam Ahmed", role: "Co-founder · Technology", bio: "Wires the money to the meal and the meal to your inbox. Believes a receipt should make you feel something." },
            ].map((m) => (
              <div key={m.name} className="border border-line bg-paper p-5 transition-shadow hover:shadow-[8px_10px_0_rgba(33,21,17,0.06)]">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center bg-sand display text-ink/70">{m.initials}</span>
                  <div>
                    <div className="font-bold">{m.name}</div>
                    <div className="timestamp text-ink/50">{m.role.toUpperCase()}</div>
                  </div>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-ink/70">{m.bio}</p>
              </div>
            ))}
          </div>
        </Reveal>
        <p className="mt-6 text-sm text-ink/60">
          Questions, kitchens, press — <a className="text-clay underline-offset-4 hover:underline" href="mailto:hello@feedsomeone.org">hello@feedsomeone.org</a>
        </p>
      </section>

      {/* ── footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link className="inline-flex min-h-[44px] items-center hover:text-clay" href="/donate">Donate</Link>
            <Link className="inline-flex min-h-[44px] items-center hover:text-clay" href="/portal">Your photos</Link>
            <Link className="inline-flex min-h-[44px] items-center hover:text-clay" href="/kitchens">Partner kitchens</Link>
            <Link className="inline-flex min-h-[44px] items-center hover:text-clay" href="/kitchen/login">Kitchen login</Link>
          </nav>
          <p className="timestamp text-ink/40">EVERY PHOTO CARRIES ITS MINUTE. TIME IS THE PRODUCT.</p>
        </div>
      </footer>
    </main>
  );
}
