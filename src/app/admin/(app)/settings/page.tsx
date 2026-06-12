import { adminDb } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata = { title: "Settings — FeedSomeone Ops" };

export default async function SettingsPage() {
  const db = adminDb();

  const { data: settings } = await db
    .from("app_settings")
    .select("key, value")
    .order("key");

  const paymentProvider = process.env.PAYMENT_PROVIDER ?? "mock";
  const emailProvider = process.env.EMAIL_PROVIDER ?? "local";
  const cronSecretPresent = Boolean(process.env.CRON_SECRET);

  return (
    <div>
      <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl mb-6">Settings</h2>

      {/* Provider status */}
      <section className="mb-6">
        <p className="timestamp text-ink/50 mb-2">ACTIVE PROVIDERS</p>
        <div className="border border-line rounded divide-y divide-line">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm">Payment provider</span>
            <span className={`timestamp text-xs px-2 py-0.5 rounded-full ${paymentProvider === "stripe" ? "bg-leaf/10 text-leaf" : "bg-sand text-ink/60"}`}>
              {paymentProvider}
            </span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm">Email provider</span>
            <span className={`timestamp text-xs px-2 py-0.5 rounded-full ${emailProvider === "resend" ? "bg-leaf/10 text-leaf" : "bg-sand text-ink/60"}`}>
              {emailProvider}
            </span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm">CRON_SECRET</span>
            <span className={`timestamp text-xs ${cronSecretPresent ? "text-leaf" : "text-clay"}`}>
              {cronSecretPresent ? "configured" : "missing"}
            </span>
          </div>
        </div>
      </section>

      {/* App settings */}
      <section className="mb-6">
        <p className="timestamp text-ink/50 mb-2">APP SETTINGS (READ-ONLY)</p>
        <div className="border border-line rounded divide-y divide-line">
          {(settings ?? []).map((s) => (
            <div key={s.key as string} className="px-4 py-3">
              <p className="timestamp text-xs text-ink/50 mb-1">{s.key as string}</p>
              <pre className="text-xs text-ink bg-sand rounded p-2 overflow-x-auto">
                {JSON.stringify(s.value, null, 2)}
              </pre>
            </div>
          ))}
          {(settings ?? []).length === 0 && (
            <p className="text-sm text-ink/50 p-4">No settings configured.</p>
          )}
        </div>
      </section>

      <Link
        href="/api/health"
        target="_blank"
        className="timestamp text-xs text-clay hover:text-clay-deep"
      >
        /api/health →
      </Link>
    </div>
  );
}
