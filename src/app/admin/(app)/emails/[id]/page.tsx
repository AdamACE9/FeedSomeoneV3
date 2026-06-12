import { adminDb } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import EmailPreview from "./EmailPreview";

export const metadata = { title: "Email Preview — FeedSomeone Ops" };

export default async function EmailPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = adminDb();

  const { data: email } = await db
    .from("email_outbox")
    .select("id, to_email, subject, html, kind, status, created_at, provider")
    .eq("id", id)
    .single();

  if (!email) notFound();

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin/emails" className="text-sm text-ink/50 hover:text-ink">
          ← Emails
        </Link>
        <span className="timestamp text-xs bg-sand border border-line px-2 py-0.5 rounded">
          {email.kind as string}
        </span>
        <span
          className={`timestamp text-xs ${
            (email.status as string) === "sent" ? "text-leaf" : "text-clay"
          }`}
        >
          {email.status as string}
        </span>
      </div>

      <p className="font-medium text-sm text-ink mb-1">{email.to_email as string}</p>
      <p className="text-sm text-ink/60 mb-4">{email.subject as string}</p>

      <EmailPreview html={email.html as string} />
    </div>
  );
}
