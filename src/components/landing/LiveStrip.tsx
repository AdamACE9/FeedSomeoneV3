"use client";

import { useEffect, useRef, useState } from "react";

type Item = { id: string; url: string; city: string; time: string; takenAt: string };

/**
 * "Recently fed", live. Polls /api/recent; when a kitchen serves a new child,
 * that photo slides in from the left and the oldest drops off the right — with
 * the minute it was fed. Refreshes on tab focus too.
 */
export default function LiveStrip({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [freshId, setFreshId] = useState<string | null>(null);
  const seen = useRef(new Set(initial.map((i) => i.id)));

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/recent", { cache: "no-store" });
        const { photos } = (await r.json()) as { photos: Item[] };
        if (!alive || !photos?.length) return;
        const fresh = photos.filter((p) => !seen.current.has(p.id));
        if (!fresh.length) return;
        fresh.forEach((p) => seen.current.add(p.id));
        setItems((prev) => [...fresh, ...prev].slice(0, 12));
        setFreshId(fresh[0].id);
        window.setTimeout(() => alive && setFreshId(null), 2200);
      } catch {
        /* offline — try again next tick */
      }
    };
    const t = window.setInterval(poll, 25000);
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!items.length) {
    return (
      <div className="w-full px-5 py-6 text-[15px] text-ink/55">
        The first photos arrive as kitchens serve their first meals today.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-4 px-5">
      {items.map((p) => (
        <figure key={p.id} className={`lift w-52 flex-none sm:w-56 ${freshId === p.id ? "fresh-in" : ""}`}>
          <div className="photo aspect-[4/5] border border-ink/12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="A meal moment" />
            <span className="photo-stamp">{freshId === p.id ? "just now" : p.time}</span>
          </div>
          <figcaption className="mt-2.5 text-[14px] text-ink/65">{p.city}</figcaption>
        </figure>
      ))}
    </div>
  );
}
