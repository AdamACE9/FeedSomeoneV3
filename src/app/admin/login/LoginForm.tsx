"use client";

import { useActionState } from "react";
import { adminLoginAction } from "@/lib/admin-actions";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(adminLoginAction, {
    error: null as string | null,
  });

  return (
    <form action={formAction} className="bg-paper border border-line rounded p-6 space-y-4" noValidate>
      <div>
        <label className="block text-sm font-medium text-ink mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          disabled={pending}
          className="w-full border border-line rounded px-3 py-2 text-ink bg-paper focus:outline-none focus:border-clay text-base"
          autoComplete="username"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink mb-1" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          disabled={pending}
          className="w-full border border-line rounded px-3 py-2 text-ink bg-paper focus:outline-none focus:border-clay text-base"
          autoComplete="current-password"
        />
      </div>
      {state.error && (
        <p className="text-clay text-sm" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-clay text-paper font-semibold rounded px-4 py-3 min-h-[44px] hover:bg-clay-deep transition-colors disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
