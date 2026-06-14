"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { donorAuth, type AuthState } from "./actions";

const initial: AuthState = { error: null };

export default function PortalLoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [state, formAction, isPending] = useActionState(donorAuth, initial);
  const signup = mode === "signup";

  return (
    <main className="min-h-screen bg-paper flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
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
          {signup
            ? "Make an account with the email you donated with — your meals show up inside."
            : "Log in to see every meal you've paid for, with the minute each was served."}
        </p>

        <form action={formAction} className="mt-8 flex flex-col gap-4" noValidate>
          <input type="hidden" name="mode" value={mode} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="timestamp text-ink/60">YOUR EMAIL</label>
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="timestamp text-ink/60">PASSWORD</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={6}
              disabled={isPending}
              placeholder={signup ? "at least 6 characters" : "your password"}
              className="h-12 px-4 border border-line bg-sand text-ink text-base focus:outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
            />
          </div>

          {state.error && (
            <p className="text-clay text-sm" role="alert">{state.error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-[56px] items-center justify-center bg-clay px-7 text-[17px] font-bold text-paper transition-colors hover:bg-clay-deep disabled:opacity-60"
          >
            {isPending ? "One moment…" : signup ? "Create account →" : "Log in →"}
          </button>
        </form>

        <button
          onClick={() => setMode(signup ? "login" : "signup")}
          className="timestamp mt-6 text-ink/50 hover:text-clay underline-offset-4 hover:underline min-h-[44px] inline-flex items-center"
        >
          {signup ? "Already have an account? Log in" : "New here? Create an account"}
        </button>
      </div>
    </main>
  );
}
