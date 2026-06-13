"use client";

import { useEffect, useState } from "react";

/**
 * The donor's own local time, ticking — the emotional hook behind "time is the
 * product": somewhere, right now, at this minute, a child is being fed.
 * Renders a stable placeholder until mounted to avoid hydration mismatch.
 */
export default function LocalClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const label = now
    ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "—:—";

  return (
    <span className="tabular-nums">
      {label}
      <span className="blink" aria-hidden> ·</span>
    </span>
  );
}
