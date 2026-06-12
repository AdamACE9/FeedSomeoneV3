import { NextRequest, NextResponse } from "next/server";
import { currentUser, adminDb } from "@/lib/supabase/server";
import { qrPngBuffer } from "@/lib/qr";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "admin") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const db = adminDb();

  const { data: campaign } = await db
    .from("qr_campaigns")
    .select("id, slug")
    .eq("id", id)
    .single();

  if (!campaign) {
    return new NextResponse("Not found", { status: 404 });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const qrUrl = `${site}/q/${campaign.slug}`;
  const buf = await qrPngBuffer(qrUrl);

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="qr-${campaign.slug}.png"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
