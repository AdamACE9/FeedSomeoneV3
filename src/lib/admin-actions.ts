"use server";
/**
 * All admin server actions — grouped here so Next.js tree-shakes unused ones
 * and so audit() is always co-located with mutations.
 * Import individual actions into pages as needed.
 */

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { adminDb, audit } from "@/lib/supabase/server";
import { allocateReceipt } from "@/lib/receipts";
import { sendDelivery } from "@/lib/deliver";
import { sendEmail } from "@/lib/email";
import { kitchenWelcomeEmail } from "@/lib/email/render";
import { applyPrivacyBlur } from "@/lib/blur";
import { getPaymentProvider } from "@/lib/payments";
import { mealsAmountLocal, mealsAmountInr } from "@/lib/money";

/* ── helpers ──────────────────────────────────────────────────────────────── */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ── AUTH ─────────────────────────────────────────────────────────────────── */

export async function adminLoginAction(formData: FormData) {
  const { serverClient } = await import("@/lib/supabase/server");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supa = await serverClient();
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function adminSignOutAction() {
  const { serverClient } = await import("@/lib/supabase/server");
  const supa = await serverClient();
  await supa.auth.signOut();
  return { ok: true };
}

export async function adminChangePasswordAction(actorEmail: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) return { error: "Password must be at least 8 characters." };
  const { serverClient } = await import("@/lib/supabase/server");
  const supa = await serverClient();
  // Capture identity BEFORE the password update — rotating the password can
  // disturb the session so a getUser() afterwards may return null, which would
  // silently skip clearing the flag and trap the admin on this page forever.
  const { data: { user: before } } = await supa.auth.getUser();
  const { error } = await supa.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  // Clear must_change_password using the pre-rotation identity; if the session
  // was lost, fall back to matching the auth user by email via the admin API.
  let userId = before?.id ?? null;
  if (!userId) {
    const { data: list } = await adminDb().auth.admin.listUsers();
    userId = list?.users.find((u) => u.email?.toLowerCase() === actorEmail.toLowerCase())?.id ?? null;
  }
  if (userId) {
    await adminDb().from("profiles").update({ must_change_password: false }).eq("user_id", userId);
    await audit(actorEmail, "password_changed", "profiles", userId);
  }
  return { ok: true };
}

/* ── PHOTOS ───────────────────────────────────────────────────────────────── */

export async function releasePhotoAction(actorEmail: string, photoId: string) {
  await adminDb().from("photos").update({ status: "available", dup_of: null }).eq("id", photoId);
  await audit(actorEmail, "photo_released", "photos", photoId);
  revalidatePath("/admin/photos");
  return { ok: true };
}

export async function rejectPhotoAction(actorEmail: string, photoId: string) {
  await adminDb().from("photos").update({ status: "rejected" }).eq("id", photoId);
  await audit(actorEmail, "photo_rejected", "photos", photoId);
  revalidatePath("/admin/photos");
  return { ok: true };
}

export async function blurPhotoAction(actorEmail: string, photoId: string) {
  const db = adminDb();
  const { data: photo } = await db.from("photos").select("storage_path, blurred_path, kitchen_id").eq("id", photoId).single();
  if (!photo) return { error: "Photo not found." };
  if (photo.blurred_path) return { error: "Photo already blurred." };

  // Download original
  const { data: fileData, error: dlErr } = await db.storage.from("photos").download(photo.storage_path as string);
  if (dlErr || !fileData) return { error: "Could not download photo." };

  const original = Buffer.from(await (fileData as Blob).arrayBuffer());
  const blurred = await applyPrivacyBlur(original);

  const blurredPath = `${photo.kitchen_id}/blurred-${photoId}.jpg`;
  const { error: upErr } = await db.storage.from("photos").upload(blurredPath, blurred, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (upErr) return { error: upErr.message };

  await db.from("photos").update({ blurred_path: blurredPath }).eq("id", photoId);
  await audit(actorEmail, "photo_blurred", "photos", photoId, { blurred_path: blurredPath });
  revalidatePath("/admin/photos");
  return { ok: true };
}

export async function forceSendPhotoAction(actorEmail: string, photoId: string, donorEmail: string) {
  const db = adminDb();

  // Check photo is available
  const { data: photo } = await db.from("photos").select("id, status").eq("id", photoId).single();
  if (!photo) return { error: "Photo not found." };
  if (photo.status !== "available") return { error: `Photo status is '${photo.status}', must be 'available'.` };

  // Find donor
  const { data: donor } = await db.from("donors").select("id, currency, tz, email").eq("email", donorEmail).maybeSingle();
  if (!donor) return { error: "No donor found with that email." };

  const sessionId = `admin_force_${photoId}`;
  const currency = (donor.currency as "INR" | "USD" | "AED") ?? "INR";

  // Create donation row
  const { data: donation, error: donErr } = await db.from("donations").insert({
    donor_id: donor.id,
    type: "one_time",
    status: "paid",
    paid_at: new Date().toISOString(),
    quantity_total: 1,
    days: 1,
    per_day_quantity: 1,
    currency,
    amount_local: 0,
    amount_inr: 0,
    donor_tz: (donor.tz as string) ?? "Asia/Kolkata",
    provider: "admin",
    provider_session_id: sessionId,
  }).select("id").single();
  if (donErr) return { error: donErr.message };

  // Allocate receipt
  await allocateReceipt(donation.id as string);

  // Insert donation_day
  const { data: day, error: dayErr } = await db.from("donation_days").insert({
    donation_id: donation.id,
    day_index: 1,
    quantity: 1,
    status: "assigned",
  }).select("id").single();
  if (dayErr) return { error: dayErr.message };

  // photo_assignments
  const { error: paErr } = await db.from("photo_assignments").insert({
    photo_id: photoId,
    donation_day_id: day.id,
    donor_id: donor.id,
  });
  if (paErr) return { error: paErr.message };

  // Mark photo assigned
  await db.from("photos").update({ status: "assigned" }).eq("id", photoId);

  // Create delivery row
  const { data: delivery, error: delErr } = await db.from("deliveries").insert({
    donation_day_id: day.id,
    donor_id: donor.id,
    recipient_email: donor.email as string,
    scheduled_at: new Date().toISOString(),
    status: "scheduled",
  }).select("id, donation_day_id, donor_id, recipient_email, scheduled_at, status, attempt_count").single();
  if (delErr) return { error: delErr.message };

  // Send immediately
  try {
    await sendDelivery(delivery as Parameters<typeof sendDelivery>[0]);
  } catch (err) {
    return { error: `Delivery row created but send failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  await audit(actorEmail, "force_send", "photos", photoId, { donor_email: donorEmail, donation_id: donation.id });
  revalidatePath("/admin/photos");
  return { ok: true };
}

/* ── KITCHENS ─────────────────────────────────────────────────────────────── */

export async function toggleKitchenAction(actorEmail: string, kitchenId: string, enabled: boolean) {
  await adminDb().from("kitchens").update({ enabled }).eq("id", kitchenId);
  await audit(actorEmail, enabled ? "kitchen_enabled" : "kitchen_disabled", "kitchens", kitchenId);
  revalidatePath("/admin/kitchens");
  return { ok: true };
}

export async function createKitchenAction(actorEmail: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const tz = String(formData.get("tz") ?? "Asia/Kolkata").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (!name || !city || !country || !email) return { error: "All fields are required." };

  const password = crypto.randomBytes(9).toString("base64url");
  const db = adminDb();

  // Create auth user
  const { data: authData, error: authErr } = await (db.auth as unknown as {
    admin: {
      createUser: (opts: { email: string; password: string; email_confirm: boolean }) => Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
    };
  }).admin.createUser({ email, password, email_confirm: true });
  if (authErr) return { error: authErr.message };
  if (!authData?.user) return { error: "Failed to create auth user." };

  const userId = authData.user.id;

  // Insert kitchen
  const { data: kitchen, error: kErr } = await db.from("kitchens").insert({
    name, city, country_code: country, tz, contact_email: email,
  }).select("id").single();
  if (kErr) return { error: kErr.message };

  // Insert profile
  const { error: pErr } = await db.from("profiles").insert({
    user_id: userId,
    role: "kitchen",
    kitchen_id: kitchen.id,
  });
  if (pErr) return { error: pErr.message };

  // Send welcome email
  const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/kitchen/login`;
  const mail = kitchenWelcomeEmail({ kitchenName: name, email, password, loginUrl });
  await sendEmail({ to: email, subject: mail.subject, html: mail.html, kind: "kitchen_welcome", refId: kitchen.id as string });

  await audit(actorEmail, "kitchen_created", "kitchens", kitchen.id as string, { name, email });
  revalidatePath("/admin/kitchens");
  return { ok: true, password, kitchenId: kitchen.id as string };
}

/* ── COUNTRIES ────────────────────────────────────────────────────────────── */

export async function toggleCountryAction(actorEmail: string, code: string, enabled: boolean) {
  await adminDb().from("countries").update({ enabled }).eq("code", code);
  await audit(actorEmail, enabled ? "country_enabled" : "country_disabled", "countries", code);
  revalidatePath("/admin/countries");
  return { ok: true };
}

/* ── QR CAMPAIGNS ─────────────────────────────────────────────────────────── */

export async function createQrCampaignAction(actorEmail: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const preset_quantity = parseInt(String(formData.get("preset_quantity") ?? "1"), 10);
  const kitchen_id = String(formData.get("kitchen_id") ?? "").trim() || null;

  if (!name) return { error: "Campaign name is required." };
  if (isNaN(preset_quantity) || preset_quantity < 1) return { error: "Preset quantity must be at least 1." };

  const db = adminDb();
  let slug = slugify(name);

  // Ensure unique slug
  const { data: existing } = await db.from("qr_campaigns").select("slug").eq("slug", slug).maybeSingle();
  if (existing) {
    const suffix = crypto.randomBytes(3).toString("hex");
    slug = `${slug}-${suffix}`;
  }

  const { data: campaign, error } = await db.from("qr_campaigns").insert({
    name,
    slug,
    preset_quantity,
    kitchen_id,
  }).select("id, slug").single();
  if (error) return { error: error.message };

  await audit(actorEmail, "qr_campaign_created", "qr_campaigns", campaign.id as string, { name, slug });
  revalidatePath("/admin/qr");
  return { ok: true, id: campaign.id as string, slug: campaign.slug as string };
}

/* ── DONORS / SUBSCRIPTIONS ───────────────────────────────────────────────── */

export async function pauseSubscriptionAction(actorEmail: string, subId: string) {
  const db = adminDb();
  const { data: sub } = await db.from("subscriptions").select("provider, provider_sub_id").eq("id", subId).single();
  if (!sub) return { error: "Subscription not found." };

  if (sub.provider === "stripe" && sub.provider_sub_id) {
    await getPaymentProvider().pauseSubscription(sub.provider_sub_id as string);
  }
  await db.from("subscriptions").update({ status: "paused" }).eq("id", subId);
  await audit(actorEmail, "subscription_paused", "subscriptions", subId);
  revalidatePath("/admin/donors");
  return { ok: true };
}

export async function resumeSubscriptionAction(actorEmail: string, subId: string) {
  const db = adminDb();
  const { data: sub } = await db.from("subscriptions").select("provider, provider_sub_id").eq("id", subId).single();
  if (!sub) return { error: "Subscription not found." };

  if (sub.provider === "stripe" && sub.provider_sub_id) {
    await getPaymentProvider().resumeSubscription(sub.provider_sub_id as string);
  }
  await db.from("subscriptions").update({ status: "active" }).eq("id", subId);
  await audit(actorEmail, "subscription_resumed", "subscriptions", subId);
  revalidatePath("/admin/donors");
  return { ok: true };
}

export async function cancelSubscriptionAction(actorEmail: string, subId: string) {
  const db = adminDb();
  const { data: sub } = await db.from("subscriptions").select("provider, provider_sub_id").eq("id", subId).single();
  if (!sub) return { error: "Subscription not found." };

  if (sub.provider === "stripe" && sub.provider_sub_id) {
    await getPaymentProvider().cancelSubscription(sub.provider_sub_id as string);
  }
  await db.from("subscriptions").update({ status: "canceled" }).eq("id", subId);
  await audit(actorEmail, "subscription_canceled", "subscriptions", subId);
  revalidatePath("/admin/donors");
  return { ok: true };
}
