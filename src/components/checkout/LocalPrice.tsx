"use client";

import { useEffect, useState } from "react";
import { perChildLocal, formatMoney, type Currency } from "@/lib/money";
import { tzCurrencyHint } from "@/lib/geo";

/**
 * Per-child price that resolves to the visitor's currency. SSR renders the
 * server-detected currency (header/fallback); on mount it refines from the
 * browser timezone — so the hero matches the QuickDonate sheet exactly. No picker.
 */
export default function LocalPrice({ initialCurrency }: { initialCurrency: Currency }) {
  const [label, setLabel] = useState(() => formatMoney(perChildLocal(initialCurrency), initialCurrency));
  useEffect(() => {
    const hint = tzCurrencyHint(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    if (hint) setLabel(formatMoney(perChildLocal(hint), hint));
  }, []);
  return <>{label}</>;
}
