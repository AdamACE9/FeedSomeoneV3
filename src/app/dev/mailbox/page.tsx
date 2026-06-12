import { notFound } from "next/navigation";
import { adminDb } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata = { title: "Dev Mailbox — FeedSomeone" };

export default async function DevMailboxPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  // Only available in dev / local email mode
  if (
    process.env.NODE_ENV === "production" &&
    process.env.EMAIL_PROVIDER !== "local"
  ) {
    notFound();
  }

  const params = await searchParams;
  const db = adminDb();

  if (params.id) {
    // Single email preview
    const { data: email } = await db
      .from("email_outbox")
      .select("id, to_email, subject, html, kind, status, created_at")
      .eq("id", params.id)
      .single();

    if (!email) notFound();

    return (
      <div className="min-h-screen bg-sand p-4">
        <div className="max-w-2xl mx-auto">
          <Link href="/dev/mailbox" className="text-sm text-ink/50 hover:text-ink mb-4 block">
            ← Mailbox
          </Link>
          <p className="font-medium text-sm mb-1">{email.to_email as string}</p>
          <p className="text-sm text-ink/60 mb-4">{email.subject as string}</p>
          <iframe
            srcDoc={email.html as string}
            sandbox="allow-same-origin"
            title="Email"
            className="w-full border border-line rounded bg-paper"
            style={{ height: "600px" }}
          />
        </div>
      </div>
    );
  }

  const { data: emails } = await db
    .from("email_outbox")
    .select("id, to_email, subject, kind, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen bg-sand p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-[family-name:var(--font-fraunces)] font-black text-2xl text-ink mb-2">
          Dev Mailbox
        </h1>
        <p className="timestamp text-xs text-ink/50 mb-6">
          EMAIL_PROVIDER=local · showing last 100 emails
        </p>

        <div className="space-y-2">
          {(emails ?? []).map((e) => (
            <Link
              key={e.id as string}
              href={`/dev/mailbox?id=${e.id}`}
              className="block border border-line rounded p-3 bg-paper hover:border-clay transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="timestamp text-xs bg-sand border border-line px-2 py-0.5 rounded mr-2">
                  {e.kind as string}
                </span>
                <span className="text-sm text-ink truncate flex-1">{e.to_email as string}</span>
                <span className="timestamp text-[10px] text-ink/40 shrink-0">
                  {new Date(e.created_at as string).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-xs text-ink/60 mt-1 truncate">{e.subject as string}</p>
            </Link>
          ))}
          {(emails ?? []).length === 0 && (
            <p className="text-sm text-ink/50 text-center py-8">No emails yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
