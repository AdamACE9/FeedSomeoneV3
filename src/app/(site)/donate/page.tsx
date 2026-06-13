import { headers } from "next/headers";
import Link from "next/link";
import { countryFromHeaders, resolveCurrency } from "@/lib/geo";
import DonateForm from "@/components/checkout/DonateForm";

export const dynamic = "force-dynamic";

export default async function DonatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const h = await headers();
  const initialCurrency = resolveCurrency(countryFromHeaders(h), null);

  const qty = typeof sp.qty === "string" ? Math.max(1, Math.min(1000, parseInt(sp.qty, 10) || 1)) : 1;
  const qr = typeof sp.qr === "string" ? sp.qr : null;
  const classroom = sp.classroom === "1";
  const canceled = sp.canceled === "1";

  return (
    <main className="grain stage min-h-screen">
      <div className="mx-auto max-w-xl px-5 py-8 sm:py-12">
        <Link href="/" className="timestamp inline-flex min-h-[44px] items-center text-ink/50 hover:text-clay">
          ← FEEDSOMEONE
        </Link>
        <h1 className="mt-3 display text-[clamp(34px,7vw,52px)] leading-[0.95] tracking-[-0.02em]">
          Feed {classroom ? "a classroom" : "a child"}<span className="text-clay">.</span>
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink/70">
          Real kitchen, real plate, real minute — photographed and delivered to your inbox at the moment it happens.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
          {["100% FEEDS CHILDREN", "PHOTO AT THE EXACT MINUTE", "NUMBERED RECEIPT"].map((t) => (
            <span key={t} className="timestamp inline-flex items-center gap-1.5 text-ink/45">
              <span className="h-1 w-1 rounded-full bg-clay" />{t}
            </span>
          ))}
        </div>
        {canceled && (
          <p className="mt-5 border border-line bg-sand px-4 py-3 text-sm">
            No charge happened. The plate's still waiting whenever you are.
          </p>
        )}
        <div className="mt-7 border border-line bg-paper/80 p-5 shadow-[10px_14px_36px_-20px_rgba(33,21,17,0.4)] backdrop-blur-sm sm:p-7">
          <DonateForm initialCurrency={initialCurrency} initialQty={classroom ? 30 : qty} initialClassroom={classroom} qrSlug={qr} />
        </div>
      </div>
    </main>
  );
}
