"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Campaign = {
  id: string; slug: string; name: string;
  presetQuantity: number; scans: number; createdAt: string;
};
type Kitchen = { id: string; name: string };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function QrClient({
  campaigns,
  kitchens,
  actorEmail,
}: {
  campaigns: Campaign[];
  kitchens: Kitchen[];
  actorEmail: string;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const { createQrCampaignAction } = await import("@/lib/admin-actions");
      const res = await createQrCampaignAction(actorEmail, fd);
      if ("error" in res && res.error) setFormError(res.error);
      else { setShowCreate(false); router.refresh(); }
    });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl">QR Campaigns</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-clay text-paper rounded px-3 py-2 min-h-[44px] text-sm font-medium hover:bg-clay-deep transition-colors"
        >
          + New campaign
        </button>
      </div>

      <div className="space-y-3">
        {campaigns.map((c) => (
          <div key={c.id} className="border border-line rounded p-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="font-medium text-sm text-ink">{c.name}</p>
                <p className="timestamp text-xs text-ink/50 mt-0.5">
                  /{c.slug} · qty {c.presetQuantity} · {c.scans} scans · {fmtDate(c.createdAt)}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <a
                  href={`/api/qr/${c.id}/png`}
                  download={`qr-${c.slug}.png`}
                  className="timestamp text-xs border border-line rounded px-2 py-1 min-h-[32px] flex items-center hover:bg-sand"
                >
                  PNG
                </a>
                <Link
                  href={`/admin/qr/${c.id}/poster`}
                  className="timestamp text-xs border border-clay text-clay rounded px-2 py-1 min-h-[32px] flex items-center hover:bg-clay/10"
                >
                  Poster
                </Link>
              </div>
            </div>
          </div>
        ))}
        {campaigns.length === 0 && (
          <p className="text-sm text-ink/50 py-8 text-center">No campaigns yet.</p>
        )}
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 bg-ink/60 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setShowCreate(false)}
        >
          <form
            onSubmit={handleCreate}
            className="bg-paper border border-line rounded-t-2xl md:rounded-lg w-full md:max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-[family-name:var(--font-fraunces)] font-black text-xl">New QR campaign</h3>
            {formError && <p className="text-clay text-sm">{formError}</p>}
            <div>
              <label className="block text-sm mb-1">Campaign name</label>
              <input name="name" required className="w-full border border-line rounded px-3 py-2 text-sm bg-paper focus:outline-none focus:border-clay" />
            </div>
            <div>
              <label className="block text-sm mb-1">Preset quantity</label>
              <input name="preset_quantity" type="number" min={1} defaultValue={1} required className="w-full border border-line rounded px-3 py-2 text-sm bg-paper focus:outline-none focus:border-clay" />
            </div>
            <div>
              <label className="block text-sm mb-1">Kitchen (optional)</label>
              <select name="kitchen_id" className="w-full border border-line rounded px-3 py-2 text-sm bg-paper focus:outline-none focus:border-clay min-h-[44px]">
                <option value="">Any kitchen</option>
                {kitchens.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 border border-line rounded px-4 py-3 min-h-[44px] text-sm hover:bg-sand">
                Cancel
              </button>
              <button type="submit" disabled={pending} className="flex-1 bg-clay text-paper rounded px-4 py-3 min-h-[44px] text-sm font-medium hover:bg-clay-deep disabled:opacity-50">
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
