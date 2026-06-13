"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fade-and-rise a block into view on scroll. Robust by design: content is hidden
 * only via JS after mount, reveals on intersect, and has a safety fallback so it
 * can NEVER get stuck invisible (no-JS, observer miss, or off-screen screenshot).
 */
export default function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // stay visible

    const rect = el.getBoundingClientRect();
    const inView = rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
    if (inView) return; // already on screen — don't hide/animate, avoids a flash

    el.classList.add("reveal"); // hide now, then reveal on scroll
    const show = () => el.classList.add("is-in");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { show(); io.disconnect(); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    const safety = setTimeout(show, 2200); // never stay hidden
    return () => { io.disconnect(); clearTimeout(safety); };
  }, []);

  return (
    <div ref={ref} className={className} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
