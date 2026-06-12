"use server";

import { redirect } from "next/navigation";
import { adminDb, audit, serverClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";

export type SubActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function getAuthenticatedEmail(): Promise<string | null> {
  const supa = await serverClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  return user?.email ?? null;
}

async function findDonorForEmail(
  email: string,
): Promise<{ id: string } | null> {
  const { data } = await adminDb()
    .from("donors")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return data ?? null;
}

export async function pauseSubscription(
  _prev: SubActionResult,
  formData: FormData,
): Promise<SubActionResult> {
  const email = await getAuthenticatedEmail();
  if (!email) return { ok: false, error: "Not signed in." };

  const donor = await findDonorForEmail(email);
  if (!donor) return { ok: false, error: "No donor record found." };

  const subId = formData.get("sub_id") as string | null;
  if (!subId) return { ok: false, error: "Missing subscription id." };

  const { data: sub } = await adminDb()
    .from("subscriptions")
    .select("id, provider_sub_id, donor_id")
    .eq("id", subId)
    .eq("donor_id", donor.id)
    .maybeSingle();

  if (!sub) return { ok: false, error: "Subscription not found." };

  try {
    if (sub.provider_sub_id) {
      const provider = getPaymentProvider();
      if (provider.name === "stripe") {
        await provider.pauseSubscription(sub.provider_sub_id as string);
      }
    }
    await adminDb()
      .from("subscriptions")
      .update({ status: "paused" })
      .eq("id", subId);
    await audit("donor:" + email, "pause", "subscription", subId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not pause subscription.",
    };
  }

  return { ok: true };
}

export async function resumeSubscription(
  _prev: SubActionResult,
  formData: FormData,
): Promise<SubActionResult> {
  const email = await getAuthenticatedEmail();
  if (!email) return { ok: false, error: "Not signed in." };

  const donor = await findDonorForEmail(email);
  if (!donor) return { ok: false, error: "No donor record found." };

  const subId = formData.get("sub_id") as string | null;
  if (!subId) return { ok: false, error: "Missing subscription id." };

  const { data: sub } = await adminDb()
    .from("subscriptions")
    .select("id, provider_sub_id, donor_id")
    .eq("id", subId)
    .eq("donor_id", donor.id)
    .maybeSingle();

  if (!sub) return { ok: false, error: "Subscription not found." };

  try {
    if (sub.provider_sub_id) {
      const provider = getPaymentProvider();
      if (provider.name === "stripe") {
        await provider.resumeSubscription(sub.provider_sub_id as string);
      }
    }
    await adminDb()
      .from("subscriptions")
      .update({ status: "active" })
      .eq("id", subId);
    await audit("donor:" + email, "resume", "subscription", subId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resume subscription.",
    };
  }

  return { ok: true };
}

export async function cancelSubscription(
  _prev: SubActionResult,
  formData: FormData,
): Promise<SubActionResult> {
  const email = await getAuthenticatedEmail();
  if (!email) return { ok: false, error: "Not signed in." };

  const donor = await findDonorForEmail(email);
  if (!donor) return { ok: false, error: "No donor record found." };

  const subId = formData.get("sub_id") as string | null;
  if (!subId) return { ok: false, error: "Missing subscription id." };

  const { data: sub } = await adminDb()
    .from("subscriptions")
    .select("id, provider_sub_id, donor_id")
    .eq("id", subId)
    .eq("donor_id", donor.id)
    .maybeSingle();

  if (!sub) return { ok: false, error: "Subscription not found." };

  try {
    if (sub.provider_sub_id) {
      const provider = getPaymentProvider();
      if (provider.name === "stripe") {
        await provider.cancelSubscription(sub.provider_sub_id as string);
      }
    }
    await adminDb()
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("id", subId);
    await audit("donor:" + email, "cancel", "subscription", subId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not cancel subscription.",
    };
  }

  return { ok: true };
}

export async function signOut(): Promise<never> {
  const supa = await serverClient();
  await supa.auth.signOut();
  redirect("/");
}
