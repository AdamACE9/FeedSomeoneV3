"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Kitchen = {
  id: string; name: string; city: string; countryCode: string;
  tz: string; contactEmail: string | null; enabled: boolean;
  createdAt: string; photosTotal: number; photosToday: number;
};

type Country = { code: string; name: string };

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors min-w-[44px] min-h-[44px] focus:outline-none disabled:opacity-50 ${checked ? "bg-leaf" : "bg-line"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-paper transform transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

export default function KitchensClient({
  kitchens,
  countries,
  actorEmail,
}: {
  kitchens: Kitchen[];
  countries: Country[];
  actorEmail: string;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function doToggle(kitchenId: string, current: boolean) {
    startTransition(async () => {
      const { toggleKitchenAction } = await import("@/lib/admin-actions");
      await toggleKitchenAction(actorEmail, kitchenId, !current);
      router.refresh();
    });
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const { createKitchenAction } = await import("@/lib/admin-actions");
      const res = await createKitchenAction(actorEmail, fd);
      if ("error" in res && res.error) {
        setFormError(res.error);
      } else if ("password" in res && res.password) {
        setCreatedPassword(res.password as string);
        setShowCreate(false);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl">Kitchens</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-clay text-paper rounded px-3 py-2 min-h-[44px] text-sm font-medium hover:bg-clay-deep transition-colors"
        >
          + Add kitchen
        </button>
      </div>

      {/* Created password display (one-time) */}
      {createdPassword && (
        <div className="mb-4 border border-leaf rounded p-4 bg-leaf/5">
          <p className="text-sm text-leaf font-medium mb-1">Kitchen created. Show this password once:</p>
          <p className="timestamp text-lg text-ink select-all">{createdPassword}</p>
          <button onClick={() => setCreatedPassword(null)} className="mt-2 text-xs text-ink/50 hover:text-ink">
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-3 mb-8">
        {kitchens.map((k) => (
          <div key={k.id} className="border border-line rounded p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-sm text-ink">{k.name}</p>
              <p className="text-xs text-ink/60">{k.city} · {k.countryCode} · {k.tz}</p>
              {k.contactEmail && <p className="text-xs text-ink/50">{k.contactEmail}</p>}
              <p className="timestamp text-[10px] text-ink/40 mt-1">
                {k.photosTotal} photos total · {k.photosToday} today
              </p>
            </div>
            <Toggle checked={k.enabled} onChange={() => doToggle(k.id, k.enabled)} disabled={pending} />
          </div>
        ))}
        {kitchens.length === 0 && <p className="text-sm text-ink/50 py-8 text-center">No kitchens yet.</p>}
      </div>

      {/* Create form sheet */}
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
            <h3 className="font-[family-name:var(--font-fraunces)] font-black text-xl">Add kitchen</h3>

            {formError && <p className="text-clay text-sm">{formError}</p>}

            <div>
              <label className="block text-sm mb-1">Kitchen name</label>
              <input name="name" required className="w-full border border-line rounded px-3 py-2 text-sm bg-paper focus:outline-none focus:border-clay" />
            </div>
            <div>
              <label className="block text-sm mb-1">City</label>
              <input name="city" required className="w-full border border-line rounded px-3 py-2 text-sm bg-paper focus:outline-none focus:border-clay" />
            </div>
            <div>
              <label className="block text-sm mb-1">Country</label>
              <select name="country" required className="w-full border border-line rounded px-3 py-2 text-sm bg-paper focus:outline-none focus:border-clay min-h-[44px]">
                <option value="">Select…</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Timezone</label>
              <input name="tz" defaultValue="Asia/Kolkata" required className="w-full border border-line rounded px-3 py-2 text-sm bg-paper focus:outline-none focus:border-clay" />
            </div>
            <div>
              <label className="block text-sm mb-1">Contact email</label>
              <input name="email" type="email" required className="w-full border border-line rounded px-3 py-2 text-sm bg-paper focus:outline-none focus:border-clay" />
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
