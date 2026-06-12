"use client";

import { useEffect, useState } from "react";

type Status = {
  status: string;
  receipt: string | null;
  delivery: { status: string; scheduledLabel: string | null } | null;
};

/**
 * The anticipation panel. Polls while the meal is unpaid/unmatched and flips
 * live the moment a kitchen photo is locked to this donation.
 */
export default function StatusPanel({ donationId, initial }: { donationId: string; initial: Status }) {
  const [s, setS] = useState<Status>(initial);

  const settled = s.status === "paid" && (s.delivery?.status === "scheduled" || s.delivery?.status === "sent");
  useEffect(() => {
    if (settled || s.status === "failed") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/donations/${donationId}/status`, { cache: "no-store" });
        if (r.ok) setS((await r.json()) as Status);
      } catch { /* next poll */ }
    }, 6000);
    return () => clearInterval(t);
  }, [donationId, settled, s.status]);

  if (s.status === "pending") {
    return (
      <div className="border border-line bg-sand/50 p-5">
        <p className="timestamp text-ink/60">CONFIRMING PAYMENT…</p>
        <p className="mt-2 text-[15px] text-ink/75">One moment — your bank is shaking hands with our kitchen.</p>
      </div>
    );
  }
  if (s.status === "failed") {
    return (
      <div className="border border-clay/40 bg-clay/5 p-5">
        <p className="timestamp text-clay-deep">PAYMENT DIDN'T COMPLETE</p>
        <p className="mt-2 text-[15px]">Nothing was charged. <a href="/donate" className="text-clay font-bold underline-offset-4 hover:underline">Try again →</a></p>
      </div>
    );
  }

  const d = s.delivery;
  if (!d || d.status === "waiting") {
    return (
      <div className="border border-line bg-sand/50 p-5">
        <p className="timestamp inline-flex items-center gap-2 text-ink/70">
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-ping rounded-full bg-marigold opacity-60 motion-reduce:hidden" />
            <span className="relative h-2 w-2 rounded-full bg-marigold" />
          </span>
          WAITING FOR A KITCHEN
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink/80">
          Right now, somewhere out there, a kitchen is about to cook this meal. Your photo doesn't exist yet —
          <b> it's about to be a real moment.</b> Your inbox will know the minute it happens.
        </p>
        <p className="timestamp mt-3 text-ink/45">THIS PAGE UPDATES ITSELF. YOU CAN CLOSE IT.</p>
      </div>
    );
  }
  if (d.status === "scheduled") {
    return (
      <div className="border border-leaf/40 bg-[#eef3ec] p-5">
        <p className="timestamp text-leaf">PHOTO LOCKED IN</p>
        <p className="mt-2 text-[15px] leading-relaxed">
          The meal is matched. Your photo arrives at <b>{d.scheduledLabel ?? "its exact minute"}</b> — the same
          wall-clock minute it was taken in the kitchen.
        </p>
      </div>
    );
  }
  return (
    <div className="border border-leaf/40 bg-[#eef3ec] p-5">
      <p className="timestamp text-leaf">DELIVERED</p>
      <p className="mt-2 text-[15px]">
        The photo is in your inbox. <a href="/portal" className="font-bold text-leaf underline-offset-4 hover:underline">See all your minutes →</a>
      </p>
    </div>
  );
}
