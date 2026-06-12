"use client";

import { useActionState } from "react";
import { signInAction } from "./actions";

export default function KitchenLoginPage() {
  const [state, formAction, isPending] = useActionState(signInAction, {
    error: null,
  });

  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand headline */}
        <h1
          className="text-4xl font-black text-ink mb-1"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          Kitchen door.
        </h1>
        <p
          className="text-xs text-ink/50 mb-10 tracking-widest uppercase"
          style={{ fontFamily: "var(--font-dm-mono)" }}
        >
          FeedSomeone · Kitchen portal
        </p>

        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="email"
              className="text-xs text-ink/60"
              style={{ fontFamily: "var(--font-dm-mono)" }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isPending}
              className="h-12 px-4 border border-line bg-sand text-ink text-base rounded-none focus:outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
              placeholder="kitchen@example.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="password"
              className="text-xs text-ink/60"
              style={{ fontFamily: "var(--font-dm-mono)" }}
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={isPending}
              className="h-12 px-4 border border-line bg-sand text-ink text-base rounded-none focus:outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
            />
          </div>

          {state.error && (
            <p
              className="text-sm text-clay"
              style={{ fontFamily: "var(--font-dm-mono)" }}
              role="alert"
            >
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="h-12 bg-clay text-paper text-base font-medium active:scale-[0.99] transition-transform disabled:opacity-60 mt-2"
          >
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p
          className="mt-8 text-xs text-ink/40 text-center"
          style={{ fontFamily: "var(--font-dm-mono)" }}
        >
          Cook. Photograph. Upload. That is the whole job.
        </p>
      </div>
    </main>
  );
}
