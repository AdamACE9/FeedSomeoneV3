"use client";

import { useActionState } from "react";
import Link from "next/link";
import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export default function PortalLoginPage() {
  const [state, formAction, isPending] = useActionState(
    sendMagicLink,
    initialState,
  );

  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <Link
          href="/"
          className="font-[family-name:var(--font-fraunces)] font-black text-xl tracking-tight"
        >
          FeedSomeone<span className="text-clay">.</span>
        </Link>

        <h1 className="mt-8 font-[family-name:var(--font-fraunces)] font-black text-4xl leading-[0.98] tracking-tight">
          Your photos<br />
          are waiting<span className="text-clay">.</span>
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink/70">
          We&apos;ll email you a key. No password, no fuss — the door opens for ten minutes.
        </p>

        {state.status === "sent" ? (
          <div className="mt-8 border border-line bg-sand p-5">
            <p className="font-[family-name:var(--font-fraunces)] font-black text-xl">
              Check your inbox<span className="text-clay">.</span>
            </p>
            <p className="mt-2 text-[15px] text-ink/70 leading-relaxed">
              The door&apos;s open for 10 minutes — tap the link and your photos are right there.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="timestamp mt-5 text-ink/50 hover:text-clay underline-offset-4 hover:underline min-h-[44px] inline-flex items-center"
            >
              SEND ANOTHER
            </button>
          </div>
        ) : (
          <form action={formAction} className="mt-8 flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="timestamp text-ink/60"
              >
                YOUR EMAIL
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={isPending}
                placeholder="you@example.com"
                className="h-12 px-4 border border-line bg-sand text-ink text-base focus:outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
              />
            </div>

            {state.status === "error" && (
              <p className="text-clay text-sm">{state.message}</p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex min-h-[56px] items-center justify-center bg-clay px-7 text-[17px] font-bold text-paper transition-colors hover:bg-clay-deep disabled:opacity-60"
            >
              {isPending ? "Sending…" : "Email me a key →"}
            </button>
          </form>
        )}

        {/* Dev-only hint */}
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-6 timestamp text-ink/40 text-[10px]">
            LOCAL DEV: magic links land at{" "}
            <a
              href="http://127.0.0.1:54324"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              http://127.0.0.1:54324
            </a>{" "}
            (Mailpit)
          </p>
        )}
      </div>
    </main>
  );
}
