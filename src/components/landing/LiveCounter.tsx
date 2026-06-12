"use client";

import { useEffect, useRef, useState } from "react";

type Stats = { fed_today?: number; total_meals?: number; total_donors?: number; kitchens?: number };

/**
 * "847 children fed today" — live. SSE first, 25s polling fallback,
 * count-up animation (instant under prefers-reduced-motion).
 */
export default function LiveCounter({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  const [display, setDisplay] = useState(initial);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(async () => {
        try {
          const r = await fetch("/api/counter", { cache: "no-store" });
          const s = (await r.json()) as Stats;
          if (typeof s.fed_today === "number") setValue(s.fed_today);
        } catch { /* offline — try next round */ }
      }, 25_000);
    };

    try {
      es = new EventSource("/api/counter/stream");
      es.onmessage = (ev) => {
        try {
          const s = JSON.parse(ev.data) as Stats;
          if (typeof s.fed_today === "number") setValue(s.fed_today);
        } catch { /* malformed frame */ }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        startPolling();
      };
    } catch {
      startPolling();
    }

    const onFocus = () => {
      fetch("/api/counter", { cache: "no-store" })
        .then((r) => r.json())
        .then((s: Stats) => typeof s.fed_today === "number" && setValue(s.fed_today))
        .catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => {
      es?.close();
      if (poll) clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const from = display;
    const to = value;
    if (from === to) return;
    const t0 = performance.now();
    const dur = 700;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className="inline-flex items-center gap-2 border border-line bg-paper px-3.5 py-1.5 text-sm">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-leaf opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-leaf" />
      </span>
      <span className="font-medium tabular-nums">
        {display.toLocaleString("en-IN")} {display === 1 ? "child" : "children"} fed today
      </span>
    </span>
  );
}
