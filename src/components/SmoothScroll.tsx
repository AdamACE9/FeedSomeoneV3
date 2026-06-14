"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Momentum smooth-scroll — the single biggest "premium feel" upgrade for a
 * scroll-led editorial site. Fully disabled under prefers-reduced-motion, and
 * pauses itself while a modal locks the body (overflow:hidden), so the
 * QuickDonate sheet and other overlays behave normally.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.6 });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // pause Lenis whenever the body scroll is locked (modals/sheets)
    const obs = new MutationObserver(() => {
      if (document.body.style.overflow === "hidden") lenis.stop();
      else lenis.start();
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ["style"] });

    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
      lenis.destroy();
    };
  }, []);

  return null;
}
