"use client";

import { useEffect, useRef, useState } from "react";

type Stat = { label: string; value: number };

function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(to);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (!started.current && entries.some((e) => e.isIntersecting)) {
        started.current = true;
        const t0 = performance.now();
        const dur = 1200;
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        io.disconnect();
      }
    });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [to]);

  return (
    <span ref={ref} className="tabular-nums">
      {n.toLocaleString("en-IN")}
    </span>
  );
}

/**
 * Dark confidence band. Numbers stay hidden below credibility thresholds
 * (env-configurable) — the zero-admin-fee badge and the promise line always show.
 */
export default function StatsBand({ stats, showNumbers }: { stats: Stat[]; showNumbers: boolean }) {
  return (
    <section className="bg-ink text-paper">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
        <span className="inline-block border border-marigold/60 bg-marigold/10 px-3 py-1.5 text-[13px] text-marigold">
          100% goes to meals — zero admin fee.
        </span>

        {showNumbers && (
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="font-[family-name:var(--font-fraunces)] font-black text-4xl sm:text-5xl text-marigold">
                  <CountUp to={s.value} />
                </div>
                <div className="mt-1 text-sm text-paper/70">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 text-sm leading-relaxed text-paper/60">
          Every donation gets a photo. Every receipt is numbered. Every kitchen is verified.
        </p>
      </div>
    </section>
  );
}
