"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function SubActions({
  subId,
  status,
  actorEmail,
}: {
  subId: string;
  status: string;
  actorEmail: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function doPause() {
    startTransition(async () => {
      const { pauseSubscriptionAction } = await import("@/lib/admin-actions");
      await pauseSubscriptionAction(actorEmail, subId);
      router.refresh();
    });
  }
  function doResume() {
    startTransition(async () => {
      const { resumeSubscriptionAction } = await import("@/lib/admin-actions");
      await resumeSubscriptionAction(actorEmail, subId);
      router.refresh();
    });
  }
  function doCancel() {
    if (!confirm("Cancel this subscription? This cannot be undone.")) return;
    startTransition(async () => {
      const { cancelSubscriptionAction } = await import("@/lib/admin-actions");
      await cancelSubscriptionAction(actorEmail, subId);
      router.refresh();
    });
  }

  if (status === "canceled") return null;

  return (
    <div className="flex gap-2">
      {status === "active" && (
        <button
          onClick={doPause}
          disabled={pending}
          className="timestamp text-xs border border-line rounded px-2 py-1 min-h-[32px] hover:bg-sand disabled:opacity-50"
        >
          Pause
        </button>
      )}
      {status === "paused" && (
        <button
          onClick={doResume}
          disabled={pending}
          className="timestamp text-xs border border-leaf text-leaf rounded px-2 py-1 min-h-[32px] hover:bg-leaf/10 disabled:opacity-50"
        >
          Resume
        </button>
      )}
      <button
        onClick={doCancel}
        disabled={pending}
        className="timestamp text-xs border border-clay text-clay rounded px-2 py-1 min-h-[32px] hover:bg-clay/10 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
