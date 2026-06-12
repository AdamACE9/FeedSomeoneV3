"use client";

import { useActionState, useState } from "react";
import {
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  type SubActionResult,
} from "./actions";

type Sub = {
  id: string;
  cadence: string | null;
  qty: number;
  amountFmt: string;
  status: string;
};

const idle: SubActionResult = { ok: true };

function PauseButton({ subId }: { subId: string }) {
  const [result, formAction, pending] = useActionState(pauseSubscription, idle);
  return (
    <form action={formAction}>
      <input type="hidden" name="sub_id" value={subId} />
      {"ok" in result && !result.ok && (
        <p className="mb-1 text-clay text-xs">{result.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="timestamp min-h-[44px] px-4 border border-line bg-sand text-ink hover:border-clay hover:text-clay transition-colors disabled:opacity-50 text-xs"
      >
        {pending ? "PAUSING…" : "PAUSE"}
      </button>
    </form>
  );
}

function ResumeButton({ subId }: { subId: string }) {
  const [result, formAction, pending] = useActionState(resumeSubscription, idle);
  return (
    <form action={formAction}>
      <input type="hidden" name="sub_id" value={subId} />
      {"ok" in result && !result.ok && (
        <p className="mb-1 text-clay text-xs">{result.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="timestamp min-h-[44px] px-4 border border-leaf bg-leaf/10 text-leaf hover:bg-leaf hover:text-paper transition-colors disabled:opacity-50 text-xs"
      >
        {pending ? "RESUMING…" : "RESUME"}
      </button>
    </form>
  );
}

function CancelButton({ subId }: { subId: string }) {
  const [armed, setArmed] = useState(false);
  const [result, formAction, pending] = useActionState(cancelSubscription, idle);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="timestamp min-h-[44px] px-4 border border-line text-ink/50 hover:border-clay hover:text-clay transition-colors text-xs"
      >
        CANCEL
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="sub_id" value={subId} />
      {"ok" in result && !result.ok && (
        <p className="mb-1 text-clay text-xs">{result.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="timestamp min-h-[44px] px-4 border border-clay bg-clay text-paper hover:bg-clay-deep transition-colors disabled:opacity-50 text-xs"
      >
        {pending ? "CANCELING…" : "TAP AGAIN TO CONFIRM"}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="timestamp min-h-[44px] px-3 text-ink/40 hover:text-ink text-xs"
      >
        KEEP
      </button>
    </form>
  );
}

export default function SubscriptionControls({ sub }: { sub: Sub }) {
  const status = sub.status;

  return (
    <div className="border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[15px]">
              {sub.qty} {sub.qty === 1 ? "child" : "children"}{" "}
              {sub.cadence ? `· ${sub.cadence}` : ""}
            </span>
            <span
              className={[
                "timestamp text-[10px] px-2 py-0.5 border",
                status === "active"
                  ? "bg-leaf/10 border-leaf/30 text-leaf"
                  : status === "paused"
                    ? "bg-sand border-line text-ink/50"
                    : "bg-sand border-line text-ink/40 line-through",
              ].join(" ")}
            >
              {status.toUpperCase()}
            </span>
          </div>
          <div className="timestamp mt-1 text-ink/50 text-[11px]">
            {sub.amountFmt} per cycle
          </div>
        </div>

        {status !== "canceled" && (
          <div className="flex flex-wrap gap-2 items-center">
            {status === "active" && <PauseButton subId={sub.id} />}
            {status === "paused" && <ResumeButton subId={sub.id} />}
            {status !== "canceled" && <CancelButton subId={sub.id} />}
          </div>
        )}
      </div>
    </div>
  );
}
