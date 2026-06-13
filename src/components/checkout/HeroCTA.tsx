"use client";

import Link from "next/link";
import type { Currency } from "@/lib/money";
import LocalPrice from "./LocalPrice";

/**
 * Primary hero CTA. A real <a href="/donate"> (works with no JS, and the E2E
 * suite asserts a link named "Feed one child"); when JS is on, clicking opens
 * the QuickDonate sheet. Price resolves to the visitor's currency.
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
      className="group inline-flex min-h-[58px] items-center gap-2.5 bg-clay px-8 text-lg font-bold text-paper transition-colors hover:bg-ink"
    >
      Feed one child · <LocalPrice initialCurrency={initialCurrency} />
      <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
    </Link>
  );
}
