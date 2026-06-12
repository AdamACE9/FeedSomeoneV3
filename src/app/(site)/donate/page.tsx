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
    <main className="mx-auto max-w-xl px-5 py-8 sm:py-12">
      <Link href="/" className="timestamp text-ink/50 hover:text-clay min-h-[44px] inline-flex items-center">
        ← FEEDSOMEONE
      </Link>
      <h1 className="mt-3 font-[family-name:var(--font-fraunces)] font-black text-4xl tracking-tight">
        Feed {classroom ? "a classroom" : "a child"}.
      </h1>
      <p className="mt-2 text-[15px] text-ink/70">
        Real kitchen, real plate, real minute — photographed and delivered to your inbox.
      </p>
      {canceled && (
        <p className="mt-4 border border-line bg-sand px-4 py-3 text-sm">
          No charge happened. The plate's still waiting whenever you are.
        </p>
      )}
      <div className="mt-7">
        <DonateForm initialCurrency={initialCurrency} initialQty={classroom ? 30 : qty} initialClassroom={classroom} qrSlug={qr} />
      </div>
    </main>
  );
}
