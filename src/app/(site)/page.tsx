import Link from "next/link";
import { headers } from "next/headers";
import { adminDb } from "@/lib/supabase/server";
import { countryFromHeaders, resolveCurrency } from "@/lib/geo";
import { formatMoney, perChildLocal } from "@/lib/money";
import { fmtTime } from "@/lib/deliver";
import LiveCounter from "@/components/landing/LiveCounter";
import HowItWorks from "@/components/landing/HowItWorks";
import StatsBand from "@/components/landing/StatsBand";

export const dynamic = "force-dynamic";

type RecentPhoto = {
  id: string;
  url: string;
  takenAt: Date;
  tz: string;
  city: string;
  donorName: string;
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
  const price = formatMoney(perChildLocal(currency), currency);

  const [stats, recent] = await Promise.all([loadStats(), loadRecent()]);
  const hero = recent[0] ?? null;
  const showNumbers =
    stats.total_meals >= Number(process.env.STATS_MIN_MEALS ?? 500) &&
    stats.total_donors >= Number(process.env.STATS_MIN_DONORS ?? 100);

  return (
    <main className="bg-paper text-ink">
      {/* ── 1 · first fold ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pt-6 pb-12 sm:pt-10">
        <div className="flex items-center justify-between">
          <span className="font-[family-name:var(--font-fraunces)] font-black text-lg tracking-tight">
            FeedSomeone<span className="text-clay">.</span>
          </span>
          <Link href="/portal" className="timestamp text-ink/60 underline-offset-4 hover:underline min-h-[44px] inline-flex items-center">
            YOUR PHOTOS
          </Link>
        </div>

        <div className="mt-8 sm:mt-12">
          <LiveCounter initial={stats.fed_today} />
          <h1 className="mt-5 font-[family-name:var(--font-fraunces)] font-black leading-[0.98] text-[44px] sm:text-7xl tracking-tight">
            Feed one child
            <br />
            right<span className="text-clay"> now.</span>
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ink/70">
            {price} buys a hot meal. The photo of that exact moment lands in your inbox — at the minute it was taken.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/donate"
              className="inline-flex min-h-[56px] items-center gap-2 bg-clay px-7 text-lg font-bold text-paper transition-colors hover:bg-clay-deep"
            >
              Feed one child · {price} →
            </Link>
            <Link href="/donate?qty=5" className="timestamp text-ink/60 underline-offset-4 hover:underline min-h-[44px] inline-flex items-center">
              OR FEED FIVE
            </Link>
          </div>
        </div>

        {/* hero photo — above the fold, always */}
        <div className="mt-10 sm:mt-14">
          {hero ? (
            <figure className="relative max-w-xl">
              <div className="border border-line bg-paper p-2.5 shadow-[6px_8px_0_rgba(33,21,17,0.08)]">
                {/* signed URLs expire hourly — plain img, not next/image cache */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hero.url} alt="A child eating a meal paid for by a donor" className="block w-full" />
                <span className="timestamp absolute right-5 top-5 bg-ink/80 px-2 py-1 text-paper">
                  {fmtTime(hero.takenAt, hero.tz).toUpperCase()}
                </span>
              </div>
              <figcaption className="mt-3 flex items-baseline justify-between gap-3">
                <span className="text-[15px]">
                  Fed by <b>{hero.donorName}</b>
                  {hero.city ? ` in ${hero.city}` : ""}
                </span>
                <span className="timestamp text-ink/50">
                  {hero.takenAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: hero.tz })}
                </span>
              </figcaption>
            </figure>
          ) : (
            <div className="max-w-xl border border-line bg-sand p-10 text-center">
              <p className="timestamp text-ink/60">THE FIRST PHOTO LANDS HERE TODAY</p>
              <p className="mt-3 text-[15px] text-ink/70">
                Our kitchens are tying their aprons. Donate now and the very first meal photo could be yours.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── 2 · carousel ───────────────────────────────────────────────── */}
      <section className="border-y border-line bg-sand/50 py-10">
        <div className="mx-auto max-w-5xl px-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute h-full w-full animate-ping rounded-full bg-clay opacity-50 motion-reduce:hidden" />
              <span className="relative h-2 w-2 rounded-full bg-clay" />
            </span>
            <h2 className="text-sm font-semibold tracking-wide">
              Recently fed <span className="text-ink/50 font-normal">· by donors like you</span>
            </h2>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto pb-2 [scrollbar-width:thin]">
          <div className="mx-auto flex max-w-5xl snap-x snap-mandatory gap-4 px-5">
            {recent.length ? (
              recent.map((p) => (
                <figure key={p.id} className="w-52 flex-none snap-start">
                  <div className="border border-line bg-paper p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="A meal moment" className="block h-44 w-full object-cover" />
                  </div>
                  <figcaption className="mt-2">
                    <div className="text-[13px]">
                      <b>{p.donorName}</b>
                      {p.city ? ` · in ${p.city}` : ""}
                    </div>
                    <div className="timestamp mt-0.5 text-ink/50">{fmtTime(p.takenAt, p.tz)}</div>
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

      {/* ── 3 · how it works ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
        <p className="timestamp text-clay">HOW IT WORKS</p>
        <h2 className="mt-2 mb-10 font-[family-name:var(--font-fraunces)] font-black text-3xl sm:text-4xl">
          Four steps. One real minute.
        </h2>
        <div className="max-w-2xl">
          <HowItWorks />
        </div>
      </section>

      {/* ── 4 · stats band ─────────────────────────────────────────────── */}
      <StatsBand
        showNumbers={showNumbers}
        stats={[
          { label: "meals served", value: stats.total_meals },
          { label: "donors", value: stats.total_donors },
          { label: "partner kitchens", value: stats.kitchens },
        ]}
      />

      {/* ── 5 · team ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <p className="timestamp text-clay">THE TEAM BEHIND FEEDSOMEONE</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 max-w-3xl">
          {[
            {
              initials: "DA", name: "Danish Ahmed", role: "Co-founder · Operations & Kitchens",
              bio: "Builds the kitchen network and runs every plate from stove to photo. If a child ate, Danish knows which kitchen, which city, which minute.",
            },
            {
              initials: "AA", name: "Adam Ahmed", role: "Co-founder · Technology",
              bio: "Wires the money to the meal and the meal to your inbox. Believes a receipt should make you feel something.",
            },
          ].map((m) => (
            <div key={m.name} className="border border-line bg-paper p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center bg-sand font-[family-name:var(--font-fraunces)] font-black text-ink/70">
                  {m.initials}
                </span>
                <div>
                  <div className="font-bold">{m.name}</div>
                  <div className="timestamp text-ink/50">{m.role.toUpperCase()}</div>
                </div>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink/70">{m.bio}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink/60">
          Questions, kitchens, press — <a className="text-clay underline-offset-4 hover:underline" href="mailto:hello@feedsomeone.org">hello@feedsomeone.org</a>
        </p>
      </section>

      {/* ── footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link className="min-h-[44px] inline-flex items-center hover:text-clay" href="/donate">Donate</Link>
            <Link className="min-h-[44px] inline-flex items-center hover:text-clay" href="/portal">Your photos</Link>
            <Link className="min-h-[44px] inline-flex items-center hover:text-clay" href="/kitchens">Partner kitchens</Link>
            <Link className="min-h-[44px] inline-flex items-center hover:text-clay" href="/kitchen/login">Kitchen login</Link>
          </nav>
          <p className="timestamp text-ink/40">EVERY PHOTO CARRIES ITS MINUTE. TIME IS THE PRODUCT.</p>
        </div>
      </footer>
    </main>
  );
}
