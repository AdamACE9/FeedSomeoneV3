"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  { k: "01", title: "You give ₹25", body: "It takes about twenty seconds, and your receipt arrives almost straight away." },
  { k: "02", title: "A kitchen cooks the meal", body: "A kitchen we work with cooks the food, serves a child, and takes a photo while they eat." },
  { k: "03", title: "The photo reaches you", body: "If it was taken at 1:15 in the afternoon there, it reaches you at 1:15 your time, usually when you least expect it." },
  { k: "04", title: "Do it every day, if you like", body: "You can feed five children every day for a week. A child eats on every day you choose." },
];

/** Vertical timeline that draws itself as it scrolls into view. */
export default function HowItWorks() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if (mq.matches) { setProgress(1); return; }
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height + vh * 0.4;
      const seen = Math.min(Math.max(vh * 0.85 - rect.top, 0), total);
      setProgress(Math.min(1, seen / total));
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          window.addEventListener("scroll", onScroll, { passive: true });
          onScroll();
        } else {
          window.removeEventListener("scroll", onScroll);
        }
      },
      { rootMargin: "20% 0px" },
    );
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* rail */}
      <div className="absolute left-[23px] top-3 bottom-3 w-px bg-line" aria-hidden />
      <div
        className="absolute left-[23px] top-3 w-px origin-top bg-clay"
        style={{ height: `calc(${Math.round(progress * 100)}% - 24px)`, transition: reduced ? "none" : "height 80ms linear" }}
        aria-hidden
      />
      <ol className="space-y-11">
        {STEPS.map((s, i) => {
          const active = reduced || progress > (i + 0.3) / STEPS.length;
          return (
            <li
              key={s.title}
              className="relative pl-16"
              style={{
                opacity: active ? 1 : 0.4,
                transform: active ? "translateX(0)" : "translateX(10px)",
                transition: reduced ? "none" : "opacity 480ms ease, transform 480ms ease",
              }}
            >
              <span
                className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center border bg-paper font-[family-name:var(--font-dm-mono)] text-sm font-medium transition-colors"
                style={{ borderColor: active ? "var(--color-clay)" : "var(--color-line)", color: active ? "var(--color-clay)" : "var(--color-ink)" }}
                aria-hidden
              >
                {s.k}
              </span>
              <h3 className="display text-[22px] leading-tight">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/70">{s.body}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
