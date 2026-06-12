"use client";

import { useEffect, useRef, useState } from "react";

const STEPS = [
  { icon: "₹", title: "You donate", body: "₹25. Twenty seconds. Receipt in your inbox before you lock your phone." },
  { icon: "🍛", title: "A kitchen serves a hot meal", body: "A real partner kitchen cooks, serves a child, and photographs the moment — timestamp and all." },
  { icon: "📷", title: "The photo reaches you at that exact minute", body: "Taken at 1:15 PM there, it lands at 1:15 PM your time. Mid-afternoon. While you're at work. That's the point." },
  { icon: "🔁", title: "Schedule it", body: "Five children every day for a week. A child eats every day you do." },
];

/** Vertical timeline that draws itself as it scrolls into view. */
export default function HowItWorks() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if (mq.matches) {
      setProgress(1);
      return;
    }
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
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* rail */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-line" aria-hidden />
      <div
        className="absolute left-[19px] top-2 w-px bg-clay origin-top"
        style={{ height: `calc(${Math.round(progress * 100)}% - 16px)`, transition: reduced ? "none" : "height 80ms linear" }}
        aria-hidden
      />
      <ol className="space-y-10">
        {STEPS.map((s, i) => {
          const visible = reduced || progress > (i + 0.35) / STEPS.length;
          return (
            <li
              key={s.title}
              className="relative pl-14"
              style={{
                opacity: visible ? 1 : 0.25,
                transform: visible ? "translateX(0)" : "translateX(10px)",
                transition: reduced ? "none" : "opacity 420ms ease, transform 420ms ease",
              }}
            >
              <span className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center border border-line bg-paper text-base" aria-hidden>
                {s.icon}
              </span>
              <h3 className="font-[family-name:var(--font-fraunces)] font-black text-xl leading-snug">{s.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink/70">{s.body}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
