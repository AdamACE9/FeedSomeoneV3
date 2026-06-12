import { Resend } from "resend";
import { adminDb } from "@/lib/supabase/server";

export type EmailKind =
  | "receipt"
  | "photo"
  | "gift_notice"
  | "anniversary"
  | "recurring_receipt"
  | "payment_failed"
  | "kitchen_welcome";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  kind: EmailKind;
  refId?: string | null;
}

let _resend: Resend | null = null;
function resend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY ?? "");
  return _resend;
}

/**
 * The single email funnel. EMAIL_PROVIDER=local writes only to email_outbox
 * (the dev mailbox at /dev/mailbox and the admin email log); =resend actually
 * sends, then logs. Every send in the entire app goes through here.
 */
export async function sendEmail(e: OutgoingEmail): Promise<{ outboxId: string; providerId: string | null }> {
  const provider = process.env.EMAIL_PROVIDER === "resend" ? "resend" : "local";
  let providerId: string | null = null;
  let status = "sent";
  let error: unknown = null;

  if (provider === "resend") {
    try {
      const { data, error: err } = await resend().emails.send({
        from: process.env.EMAIL_FROM ?? "FeedSomeone <onboarding@resend.dev>",
        to: e.to,
        subject: e.subject,
        html: e.html,
      });
      if (err) throw err;
      providerId = data?.id ?? null;
    } catch (err) {
      status = "failed";
      error = err;
    }
  }

  const { data: row, error: dbErr } = await adminDb()
    .from("email_outbox")
    .insert({
      to_email: e.to,
      subject: e.subject,
      html: e.html,
      kind: e.kind,
      ref_id: e.refId ?? null,
      provider,
      provider_id: providerId,
      status,
    })
    .select("id")
    .single();
  if (dbErr) throw dbErr;
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return { outboxId: row.id as string, providerId };
}
