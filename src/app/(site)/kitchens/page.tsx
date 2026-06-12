import Link from "next/link";
import { adminDb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Open Kitchen — the trust page. Who cooks, where, verified. */
export default async function KitchensPage() {
  const { data: kitchens } = await adminDb()
    .from("public_kitchens")
    .select("id, name, city, country_code")
    .order("name");

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="timestamp text-ink/50 hover:text-clay min-h-[44px] inline-flex items-center">
        ← FEEDSOMEONE
      </Link>
      <h1 className="mt-3 font-[family-name:var(--font-fraunces)] font-black text-4xl tracking-tight">
        The kitchens.
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink/70">
        Every photo you receive is taken inside one of these kitchens, by the people who cooked the meal.
        Each one is visited, verified, and onboarded by Danish before a single donation flows to it.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {(kitchens ?? []).length ? (
          (kitchens ?? []).map((k) => (
            <div key={k.id as string} className="border border-line bg-paper p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{k.name as string}</div>
                  <div className="text-sm text-ink/60">{k.city as string}</div>
                </div>
                <span className="border border-leaf/40 bg-[#eef3ec] px-2 py-1 text-[11px] text-leaf">VERIFIED</span>
              </div>
              <p className="timestamp mt-3 text-ink/45">COUNTRY {String(k.country_code)}</p>
            </div>
          ))
        ) : (
          <p className="text-ink/60 text-[15px]">Kitchen list is loading its aprons — back soon.</p>
        )}
      </div>

      <div className="mt-10 border border-line bg-sand/50 p-5">
        <p className="font-bold text-[15px]">Run a kitchen?</p>
        <p className="mt-1 text-sm text-ink/70">
          If you serve hot meals to children and can take a photo, you can join.
          Write to <a className="text-clay underline-offset-4 hover:underline" href="mailto:hello@feedsomeone.org">hello@feedsomeone.org</a>.
        </p>
      </div>
    </main>
  );
}
