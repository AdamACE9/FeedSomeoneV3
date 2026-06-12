"use server";

import { redirect } from "next/navigation";
import { fireMockWebhook, mockEventForSession } from "@/lib/payments";

export async function payMockSession(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId"));
  const donationId = String(formData.get("donationId"));
  const mode = String(formData.get("mode")) === "subscription" ? "subscription" : "payment";
  const successUrl = String(formData.get("successUrl"));
  await fireMockWebhook(mockEventForSession(sessionId, donationId, mode));
  redirect(successUrl);
}

export async function failMockSession(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId"));
  const donationId = String(formData.get("donationId"));
  const cancelUrl = String(formData.get("cancelUrl"));
  await fireMockWebhook({
    id: `evt_mock_fail_${sessionId}`,
    type: "payment.failed",
    donationId,
    subscriptionProviderId: null,
  });
  redirect(cancelUrl);
}
