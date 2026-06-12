"use server";

import { serverClient } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string };

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = (formData.get("email") as string | null)?.trim() ?? "";

  if (!email || !email.includes("@")) {
    return { status: "error", message: "Please enter a valid email address." };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supa = await serverClient();
  const { error } = await supa.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    return {
      status: "error",
      message: "Couldn't send the link. Try again in a moment.",
    };
  }

  return { status: "sent" };
}
