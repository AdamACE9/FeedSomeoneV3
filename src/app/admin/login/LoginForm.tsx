"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("password", password);
      const { adminLoginAction } = await import("@/lib/admin-actions");
      const res = await adminLoginAction(fd);
      if ("error" in res && res.error) {
        setError(res.error);
      } else {
        router.push("/admin");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-paper border border-line rounded p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-line rounded px-3 py-2 text-ink bg-paper focus:outline-none focus:border-clay text-base"
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p className="text-clay text-sm" role="alert">
          {error}
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
