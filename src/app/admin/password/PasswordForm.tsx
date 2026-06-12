"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function PasswordForm({ actorEmail }: { actorEmail: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    startTransition(async () => {
      const { adminChangePasswordAction } = await import("@/lib/admin-actions");
      const res = await adminChangePasswordAction(actorEmail, password);
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
        <label className="block text-sm font-medium text-ink mb-1">New password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-line rounded px-3 py-2 text-ink bg-paper focus:outline-none focus:border-clay text-base"
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink mb-1">Confirm password</label>
        <input
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-line rounded px-3 py-2 text-ink bg-paper focus:outline-none focus:border-clay text-base"
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-clay text-sm">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-clay text-paper font-semibold rounded px-4 py-3 min-h-[44px] hover:bg-clay-deep transition-colors disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
