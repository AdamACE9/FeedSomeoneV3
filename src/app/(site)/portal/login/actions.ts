"use server";

import { redirect } from "next/navigation";
import { adminDb, serverClient } from "@/lib/supabase/server";

export type AuthState = { error: string | null };

/**
 * Donor portal auth — plain email + password. One form, two modes.
 * "signup" creates a confirmed account directly via the service role
 * (email_confirm: true) so there is no email-link round-trip, then signs in.
 */
export async function donorAuth(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const mode = (formData.get("mode") as string | null) ?? "login";
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  if (!password) return { error: "Enter your password." };

  const supa = await serverClient();

  if (mode === "signup") {
    if (password.length < 6) {
      return { error: "Pick a password of at least 6 characters." };
    }
    const { error: createErr } = await adminDb().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr && !/already|registered|exist/i.test(createErr.message)) {
      return { error: "Couldn't create your account. Try again in a moment." };
    }
    const { error } = await supa.auth.signInWithPassword({ email, password });
    if (error) {
      return {
        error: createErr
          ? "That email already has an account — log in with your password instead."
          : "Account created, but sign-in failed. Try logging in.",
      };
    }
  } else {
    const { error } = await supa.auth.signInWithPassword({ email, password });
    if (error) return { error: "Incorrect email or password." };
  }

  redirect("/portal");
}
