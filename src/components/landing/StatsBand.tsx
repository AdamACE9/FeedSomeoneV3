"use client";

import { useEffect, useRef, useState } from "react";

type Stat = { label: string; value: number };

function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(to); return; }
    const io = new IntersectionObserver((entries) => {
      if (!started.current && entries.some((e) => e.isIntersecting)) {
        started.current = true;
        const t0 = performance.now();
        const dur = 1400;
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

  return <span ref={ref} className="tabular-nums">{n.toLocaleString("en-IN")}</span>;
}

/**
 * Dark confidence band — a deliberate beat in the scroll. The pull-quote and the
 * zero-admin-fee badge always show; the numbers stay hidden below credibility
 * thresholds (env-configurable), so day one doesn't advertise a small count.
 */
export default function StatsBand({ stats, showNumbers }: { stats: Stat[]; showNumbers: boolean }) {
  return (
    <section className="relative overflow-hidden bg-ink text-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(232,163,61,0.22), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <span className="inline-block border border-marigold/60 bg-marigold/10 px-3 py-1.5 text-[13px] text-marigold">
          100% goes to meals — zero admin fee.
        </span>

        <p className="mt-8 max-w-3xl display text-[clamp(28px,5vw,52px)] leading-[1.02]">
          Behind every donation is <span className="text-marigold">a child who actually ate</span> today.
          We send you the photo, so you never have to take our word for it.
        </p>

        {showNumbers && (
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="display text-5xl text-marigold sm:text-6xl"><CountUp to={s.value} /></div>
                <div className="mt-1 text-sm text-paper/70">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 text-sm leading-relaxed text-paper/55">
          You get a photo of every meal you pay for, and a numbered receipt. We check every kitchen before it joins us.
        </p>
      </div>
    </section>
  );
}
