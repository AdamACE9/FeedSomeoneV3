"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TIP_PERCENT, MIN_QUANTITY, formatMoney, mealsAmountLocal, tipAmountLocal, type Currency,
} from "@/lib/money";
import { tzCurrencyHint } from "@/lib/geo";

const CHIPS = [1, 5, 10, 30];

/**
 * The fast lane: a sheet that opens from the hero CTA and takes a donor from
 * "I want to" to "secure checkout" in three taps — amount, email, go. Posts to
 * the very same /api/checkout the full page uses; "More options" links to it.
 */
export default function QuickDonate({ initialCurrency }: { initialCurrency: Currency }) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [clientTz, setClientTz] = useState("");
  const [qty, setQty] = useState(1);
  const [tip, setTip] = useState(true); // +25% pre-selected (locked spec); one tap off
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // open via the hero CTA event; refine currency from the browser timezone
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("feedsomeone:quickdonate", onOpen);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    setClientTz(tz);
    const hint = tzCurrencyHint(tz);
    if (hint) setCurrency(hint);
    return () => window.removeEventListener("feedsomeone:quickdonate", onOpen);
  }, []);

  // lock scroll + Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const tipPercent = tip ? DEFAULT_TIP_PERCENT : 0;
  const minQ = MIN_QUANTITY[currency];
  const belowMin = qty < minQ;
  const meals = useMemo(() => mealsAmountLocal(qty, currency), [qty, currency]);
  const tipAmt = useMemo(() => tipAmountLocal(meals, tipPercent), [meals, tipPercent]);
  const total = meals + tipAmt;

  async function go() {
    setError(null);
    if (!email || !/.+@.+\..+/.test(email)) { setError("We just need your email — that's where the photo goes."); return; }
    if (belowMin) { setError(`Card networks need a small minimum in ${currency} — feed at least ${minQ}.`); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, mode: "one_time", quantity: qty, days: 1, tipPercent, currency, clientTz }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) { setError(body.error ?? "Something hiccuped — nothing was charged."); setBusy(false); return; }
      window.location.assign(body.url);
    } catch {
      setError("Network wobble — nothing was charged. Try again.");
      setBusy(false);
    }
  }

  if (!open) return null;

  const chipCls = (active: boolean) =>
    `min-h-[52px] flex-1 border text-lg font-bold tabular-nums transition-all ${
      active ? "bg-ink text-paper border-ink scale-[1.03]" : "bg-paper border-line hover:border-ink/40"
    }`;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Feed a child">
      <button aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]" style={{ animation: "rise-in 240ms ease both" }} />
      <div
        className="relative w-full max-w-md bg-paper border border-line shadow-2xl sm:rounded-none"
        style={{ animation: "rise-in 360ms cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <p className="timestamp text-clay">FEED A CHILD · RIGHT NOW</p>
            <h2 className="display text-2xl leading-none mt-1">How many?</h2>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" className="-mr-1 -mt-1 flex h-10 w-10 items-center justify-center text-2xl text-ink/40 hover:text-ink">×</button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div className="flex gap-2">
            {CHIPS.map((n) => (
              <button key={n} type="button" className={chipCls(qty === n)} onClick={() => setQty(n)}>{n}</button>
            ))}
            <div className="flex items-center border border-line">
              <button type="button" aria-label="fewer" className="min-h-[52px] w-11 text-xl hover:bg-sand" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span className="w-10 text-center tabular-nums font-bold">{qty}</span>
              <button type="button" aria-label="more" className="min-h-[52px] w-11 text-xl hover:bg-sand" onClick={() => setQty(Math.min(1000, qty + 1))}>+</button>
            </div>
          </div>

          <p className="inline-block border border-leaf/40 bg-[#eef3ec] px-3 py-2 text-[13px] text-leaf">
            We charge no admin fee — 100% of {formatMoney(meals, currency)} feeds {qty === 1 ? "a child" : "children"}.
          </p>

          <button
            type="button"
            onClick={() => setTip(!tip)}
            className={`flex w-full items-center justify-between border px-4 py-3 text-left text-sm min-h-[52px] ${tip ? "border-clay bg-clay/5" : "border-line"}`}
          >
            <span><b>Add a 25% tip?</b> <span className="text-ink/55">Keeps us running — your donation is never touched.</span></span>
            <span className={`ml-3 flex h-6 w-6 flex-none items-center justify-center border ${tip ? "bg-clay border-clay text-paper" : "border-line"}`}>{tip ? "✓" : ""}</span>
          </button>

          <input
            value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email"
            placeholder="your email — the photo lands here"
            className="w-full border border-line bg-paper px-3.5 min-h-[54px] text-[15px] outline-none focus:border-ink/60"
          />

          {error && <p className="border border-clay/40 bg-clay/5 px-3 py-2 text-[13px] text-clay-deep">{error}</p>}

          <button
            type="button" onClick={go} disabled={busy}
            className="cta-sheen group w-full min-h-[58px] bg-clay text-paper text-lg font-bold transition-colors hover:bg-clay-deep disabled:opacity-60"
          >
            <span className="sheen" aria-hidden />
            {busy ? "Opening secure checkout…" : `Feed ${qty === 1 ? "one child" : `${qty} children`} · ${formatMoney(total, currency)} →`}
          </button>

          <div className="flex items-center justify-between text-[12px] text-ink/50">
            <span>Instant numbered receipt.</span>
            <a href="/donate" className="underline-offset-4 hover:text-clay hover:underline">Schedule, gift, dedicate →</a>
          </div>
        </div>
      </div>
    </div>
  );
}
