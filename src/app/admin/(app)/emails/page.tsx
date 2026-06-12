import { adminDb } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata = { title: "Emails — FeedSomeone Ops" };

const KINDS = ["receipt", "photo", "gift_notice", "anniversary", "recurring_receipt", "payment_failed", "kitchen_welcome"] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const params = await searchParams;
  const kindFilter = params.kind ?? "";
  const db = adminDb();

  let query = db
    .from("email_outbox")
    .select("id, to_email, subject, kind, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (kindFilter && KINDS.includes(kindFilter as typeof KINDS[number])) {
    query = query.eq("kind", kindFilter);
  }

  const { data: emails } = await query;

  return (
    <div>
      <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl mb-4">Emails</h2>

      {/* Kind filter chips */}
      <div className="flex gap-2 flex-wrap mb-6">
        <Link
          href="/admin/emails"
          className={`px-3 py-1.5 rounded-full text-sm min-h-[36px] flex items-center transition-colors ${
            !kindFilter ? "bg-clay text-paper" : "bg-sand border border-line hover:border-clay"
          }`}
        >
          all
        </Link>
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/admin/emails?kind=${k}`}
            className={`px-3 py-1.5 rounded-full text-sm min-h-[36px] flex items-center transition-colors ${
              k === kindFilter ? "bg-clay text-paper" : "bg-sand border border-line hover:border-clay"
            }`}
          >
            {k.replace("_", " ")}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {(emails ?? []).map((e) => (
          <Link
            key={e.id as string}
            href={`/admin/emails/${e.id}`}
            className="block border border-line rounded p-3 hover:border-clay transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="timestamp text-xs bg-sand border border-line px-2 py-0.5 rounded mr-2">
                  {e.kind as string}
                </span>
                <span className="text-sm text-ink truncate">{e.to_email as string}</span>
              </div>
              <span className="timestamp text-[10px] text-ink/40 shrink-0">
                {timeAgo(e.created_at as string)}
              </span>
            </div>
            <p className="text-xs text-ink/60 mt-1 truncate">{e.subject as string}</p>
            <span
              className={`timestamp text-[10px] mt-0.5 inline-block ${
                (e.status as string) === "sent" ? "text-leaf" : "text-clay"
              }`}
            >
              {e.status as string}
            </span>
          </Link>
        ))}
        {(emails ?? []).length === 0 && (
          <p className="text-sm text-ink/50 py-8 text-center">No emails.</p>
        )}
      </div>
    </div>
  );
}
