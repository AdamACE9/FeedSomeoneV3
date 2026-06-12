"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TIP_PERCENT, MIN_QUANTITY, TIP_PERCENTS, formatMoney,
  mealsAmountLocal, tipAmountLocal, type Currency,
} from "@/lib/money";
import { tzCurrencyHint } from "@/lib/geo";

type Frequency = "once" | "days" | "recurring";
type Cadence = "daily" | "weekly" | "monthly";

const QTY_CHIPS = [1, 5, 10, 30];
const DAY_CHIPS = [3, 7, 14, 30];

export default function DonateForm({
  initialCurrency, initialQty, initialClassroom, qrSlug,
}: {
  initialCurrency: Currency;
  initialQty: number;
  initialClassroom: boolean;
  qrSlug: string | null;
}) {
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [clientTz, setClientTz] = useState<string>("");

  const [qty, setQty] = useState(initialQty);
  const [classroom, setClassroom] = useState(initialClassroom);
  const [freq, setFreq] = useState<Frequency>("once");
  const [days, setDays] = useState(7);
  const [cadence, setCadence] = useState<Cadence>("monthly");

  const [dedicate, setDedicate] = useState(false);
  const [dedKind, setDedKind] = useState<"memory" | "honor">("memory");
  const [dedName, setDedName] = useState("");

  const [gifting, setGifting] = useState(false);
  const [giftName, setGiftName] = useState("");
  const [giftEmail, setGiftEmail] = useState("");
  const [giftMessage, setGiftMessage] = useState("");

  const [tipPercent, setTipPercent] = useState<number>(DEFAULT_TIP_PERCENT);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // refine currency once from the browser's timezone — silently, no picker
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    setClientTz(tz);
    const hint = tzCurrencyHint(tz);
    if (hint) setCurrency(hint);
  }, []);

  const effQty = classroom ? 30 : qty;
  const effDays = freq === "days" ? days : 1;
  const chargeQty = freq === "days" ? effQty * effDays : effQty; // per charge
  const minQ = MIN_QUANTITY[currency];
  const belowMin = (freq === "recurring" ? effQty : chargeQty) < minQ;

  const mealsLocal = useMemo(() => mealsAmountLocal(chargeQty, currency), [chargeQty, currency]);
  const tipLocal = useMemo(() => tipAmountLocal(mealsLocal, tipPercent), [mealsLocal, tipPercent]);
  const totalLocal = mealsLocal + tipLocal;

  async function submit() {
    setError(null);
    if (!email || !/.+@.+\..+/.test(email)) {
      setError("We need your email — it's where the photo goes.");
      return;
    }
    if (belowMin) {
      setError(`Card networks need a small minimum in ${currency} — feed at least ${minQ} children.`);
      return;
    }
    if (dedicate && !dedName.trim()) {
      setError("Add the name for the dedication, or switch it off.");
      return;
    }
    if (gifting && (!giftName.trim() || !/.+@.+\..+/.test(giftEmail))) {
      setError("Gifts need the recipient's name and a valid email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email, firstName: firstName.trim() || undefined, anonymous,
          mode: freq === "recurring" ? "recurring" : freq === "days" ? "scheduled" : "one_time",
          quantity: effQty,
          days: effDays,
          cadence: freq === "recurring" ? cadence : undefined,
          classroom,
          tipPercent, currency, clientTz,
          dedication: dedicate ? { kind: dedKind, name: dedName.trim() } : null,
          gift: gifting ? { recipientName: giftName.trim(), recipientEmail: giftEmail, message: giftMessage.trim() || undefined } : null,
          qrSlug,
        }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error ?? "Something hiccuped — nothing was charged. Try again.");
        setSubmitting(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError("Network wobble — nothing was charged. Try again.");
      setSubmitting(false);
    }
  }

  const chip = (active: boolean) =>
    `min-h-[44px] min-w-[52px] px-3.5 border text-[15px] transition-colors ${
      active ? "bg-ink text-paper border-ink" : "bg-paper border-line hover:border-ink/50"
    }`;

  return (
    <div className="space-y-8">
      {/* how many */}
      <section>
        <h2 className="font-bold text-[15px]">How many children?</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {QTY_CHIPS.map((n) => (
            <button key={n} type="button" className={chip(!classroom && qty === n)} onClick={() => { setClassroom(false); setQty(n); }}>
              {n}
            </button>
          ))}
          <div className="flex items-center border border-line">
            <button type="button" aria-label="fewer" className="min-h-[44px] w-11 hover:bg-sand" onClick={() => { setClassroom(false); setQty(Math.max(1, qty - 1)); }}>−</button>
            <input
              type="number" min={1} max={1000} value={classroom ? 30 : qty}
              onChange={(e) => { setClassroom(false); setQty(Math.max(1, Math.min(1000, Number(e.target.value) || 1))); }}
              className="w-16 border-x border-line bg-paper py-2.5 text-center tabular-nums outline-none focus:bg-sand/50"
              aria-label="number of children"
            />
            <button type="button" aria-label="more" className="min-h-[44px] w-11 hover:bg-sand" onClick={() => { setClassroom(false); setQty(Math.min(1000, qty + 1)); }}>+</button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setClassroom(!classroom); if (!classroom) { setFreq("once"); } }}
          className={`mt-3 w-full border px-4 py-3 text-left text-sm transition-colors min-h-[56px] ${classroom ? "border-clay bg-clay/5" : "border-line hover:border-ink/40"}`}
        >
          <span className="font-bold">Feed a classroom — 30 children</span>
          <span className="block text-ink/60 mt-0.5">One payment, one collective set of photos. Schools, offices, birthdays.</span>
        </button>
      </section>

      {/* how often */}
      <section>
        <h2 className="font-bold text-[15px]">How often?</h2>
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="frequency">
          {([["once", "Just today"], ["days", "Daily streak"], ["recurring", "Ongoing"]] as Array<[Frequency, string]>).map(([f, label]) => (
            <button key={f} type="button" role="radio" aria-checked={freq === f} className={chip(freq === f)} disabled={classroom && f !== "once"} onClick={() => setFreq(f)}>
              {label}
            </button>
          ))}
        </div>
        {freq === "days" && (
          <div className="mt-3 border border-line bg-sand/40 p-4">
            <p className="text-sm">
              <b>{effQty} {effQty === 1 ? "child" : "children"} every day for…</b>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAY_CHIPS.map((d) => (
                <button key={d} type="button" className={chip(days === d)} onClick={() => setDays(d)}>
                  {d} days
                </button>
              ))}
            </div>
            <p className="timestamp mt-3 text-ink/60">
              {effDays} EMAILS · ONE PER DAY · EACH WITH THAT DAY'S {effQty} PHOTO{effQty > 1 ? "S" : ""}
            </p>
          </div>
        )}
        {freq === "recurring" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(["daily", "weekly", "monthly"] as Cadence[]).map((c) => (
              <button key={c} type="button" className={chip(cadence === c)} onClick={() => setCadence(c)}>
                {c[0].toUpperCase() + c.slice(1)}
              </button>
            ))}
            <p className="w-full timestamp text-ink/60 mt-1">PAUSE OR CANCEL ANYTIME FROM YOUR PHOTO PAGE</p>
          </div>
        )}
      </section>

      {/* dedicate + gift */}
      <section className="space-y-3">
        <button type="button" onClick={() => setDedicate(!dedicate)} className={`w-full border px-4 py-3 text-left text-sm min-h-[52px] ${dedicate ? "border-clay bg-clay/5" : "border-line hover:border-ink/40"}`}>
          <span className="font-bold">Dedicate {effQty === 1 ? "this meal" : "these meals"}</span>
          <span className="block text-ink/60 mt-0.5">“In memory of…” or “In honor of…” — on the receipt and in the photo email.</span>
        </button>
        {dedicate && (
          <div className="flex gap-2">
            <select value={dedKind} onChange={(e) => setDedKind(e.target.value as "memory" | "honor")} className="border border-line bg-paper px-3 min-h-[48px] text-sm" aria-label="dedication type">
              <option value="memory">In memory of</option>
              <option value="honor">In honor of</option>
            </select>
            <input value={dedName} onChange={(e) => setDedName(e.target.value)} maxLength={80} placeholder="their name" className="flex-1 border border-line bg-paper px-3 min-h-[48px] text-sm outline-none focus:border-ink/60" />
          </div>
        )}

        <button type="button" onClick={() => setGifting(!gifting)} className={`w-full border px-4 py-3 text-left text-sm min-h-[52px] ${gifting ? "border-clay bg-clay/5" : "border-line hover:border-ink/40"}`}>
          <span className="font-bold">This is a gift</span>
          <span className="block text-ink/60 mt-0.5">They get the notification now — and the photo when the meal happens.</span>
        </button>
        {gifting && (
          <div className="space-y-2">
            <input value={giftName} onChange={(e) => setGiftName(e.target.value)} maxLength={80} placeholder="recipient's name" className="w-full border border-line bg-paper px-3 min-h-[48px] text-sm outline-none focus:border-ink/60" />
            <input value={giftEmail} onChange={(e) => setGiftEmail(e.target.value)} type="email" placeholder="recipient's email" className="w-full border border-line bg-paper px-3 min-h-[48px] text-sm outline-none focus:border-ink/60" />
            <textarea value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} maxLength={280} placeholder="a line from you (optional)" rows={2} className="w-full border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink/60" />
          </div>
        )}
      </section>

      {/* tip */}
      <section>
        <p className="inline-block border border-leaf/40 bg-[#eef3ec] px-3 py-2 text-[13px] text-leaf">
          We charge no admin fee — 100% of {formatMoney(mealsLocal, currency)} feeds children.
        </p>
        <h2 className="mt-4 font-bold text-[15px]">Add a tip for FeedSomeone?</h2>
        <p className="mt-1 text-[13px] text-ink/60">Optional. Tips run the platform — your donation is never touched.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIP_PERCENTS.map((p) => (
            <button key={p} type="button" className={chip(tipPercent === p)} onClick={() => setTipPercent(p)}>
              {p === 0 ? "No thanks" : `+${p}%`}
            </button>
          ))}
        </div>
      </section>

      {/* you */}
      <section className="space-y-2">
        <h2 className="font-bold text-[15px]">Where should the photo go?</h2>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="your email — no account needed" className="w-full border border-line bg-paper px-3 min-h-[52px] text-[15px] outline-none focus:border-ink/60" />
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={40} autoComplete="given-name" placeholder="first name (optional — shown as “Fed by …”)" className="w-full border border-line bg-paper px-3 min-h-[48px] text-sm outline-none focus:border-ink/60" />
        <label className="flex items-center gap-2.5 text-sm text-ink/70 min-h-[44px]">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 accent-[#C4471D]" />
          Show me as “Someone” on the wall
        </label>
      </section>

      {/* summary + pay */}
      <section className="border border-line bg-sand/40 p-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt>
              Meals — {chargeQty} {chargeQty === 1 ? "child" : "children"}
              {freq === "days" ? ` (${effQty}/day × ${effDays} days)` : freq === "recurring" ? ` / ${cadence}` : ""}
            </dt>
            <dd className="tabular-nums">{formatMoney(mealsLocal, currency)}</dd>
          </div>
          {tipLocal > 0 && (
            <div className="flex justify-between text-ink/70">
              <dt>Tip ({tipPercent}%)</dt>
              <dd className="tabular-nums">{formatMoney(tipLocal, currency)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-2 font-bold text-base">
            <dt>Total{freq === "recurring" ? ` per ${cadence === "daily" ? "day" : cadence === "weekly" ? "week" : "month"}` : ""}</dt>
            <dd className="tabular-nums">{formatMoney(totalLocal, currency)}</dd>
          </div>
        </dl>
        <p className="timestamp mt-2 text-ink/50">CHARGED IN YOUR LOCAL CURRENCY.</p>

        {belowMin && (
          <p className="mt-3 border border-marigold/50 bg-marigold/10 px-3 py-2 text-[13px]">
            Card networks need a small minimum in {currency} — please feed at least {minQ} children.
          </p>
        )}
        {error && <p className="mt-3 border border-clay/40 bg-clay/5 px-3 py-2 text-[13px] text-clay-deep">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-4 w-full min-h-[56px] bg-clay text-paper text-lg font-bold transition-colors hover:bg-clay-deep disabled:opacity-60"
        >
          {submitting ? "Opening secure checkout…" : `Feed ${chargeQty === 1 ? "one child" : `${chargeQty} children`} · ${formatMoney(totalLocal, currency)} →`}
        </button>
        <p className="mt-2 text-center text-[12px] text-ink/50">Instant numbered receipt. Photo at the real minute.</p>
      </section>
    </div>
  );
}
