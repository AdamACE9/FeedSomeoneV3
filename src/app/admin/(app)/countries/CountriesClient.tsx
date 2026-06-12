"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

type Country = { code: string; name: string; enabled: boolean };

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors min-h-[44px] focus:outline-none disabled:opacity-50 ${checked ? "bg-leaf" : "bg-line"}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-paper transform transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function CountriesClient({
  countries,
  actorEmail,
}: {
  countries: Country[];
  actorEmail: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function doToggle(code: string, current: boolean) {
    startTransition(async () => {
      const { toggleCountryAction } = await import("@/lib/admin-actions");
      await toggleCountryAction(actorEmail, code, !current);
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl mb-4">Countries</h2>
      <div className="space-y-2">
        {countries.map((c) => (
          <div key={c.code} className="border border-line rounded px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-ink">{c.name}</span>
              <span className="timestamp text-xs text-ink/40 ml-2">{c.code}</span>
            </div>
            <Toggle checked={c.enabled} onChange={() => doToggle(c.code, c.enabled)} disabled={pending} />
          </div>
        ))}
      </div>
    </div>
  );
}
