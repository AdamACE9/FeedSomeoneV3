"use client";

import Link from "next/link";
import type { Currency } from "@/lib/money";
import LocalPrice from "./LocalPrice";

/**
 * Primary hero CTA. It is a real <a href="/donate"> (works with no JS, and the
 * E2E suite asserts a link named "Feed one child"). When JS is on, clicking it
 * opens the QuickDonate sheet instead of navigating — fast path, full page is
 * still one tap away. Price resolves to the visitor's currency via LocalPrice.
 */
export default function HeroCTA({ initialCurrency }: { initialCurrency: Currency }) {
  return (
    <Link
      href="/donate"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("feedsomeone:quickdonate"));
      }}
      className="cta-sheen group inline-flex min-h-[60px] items-center gap-2.5 bg-clay px-8 text-lg font-bold text-paper transition-all hover:bg-clay-deep hover:gap-3.5"
    >
      <span className="sheen" aria-hidden />
      Feed one child · <LocalPrice initialCurrency={initialCurrency} />
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}
