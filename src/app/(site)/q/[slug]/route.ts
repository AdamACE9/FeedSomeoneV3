import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const db = adminDb();

  const { data: campaign } = await db
    .from("qr_campaigns")
    .select("id, slug, preset_quantity, scans")
    .eq("slug", slug)
    .single();

  if (!campaign) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Increment scan count (fire-and-forget — don't block the redirect)
  void db
    .from("qr_campaigns")
    .update({ scans: (Number(campaign.scans) ?? 0) + 1 })
    .eq("id", campaign.id);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${site}/donate?qr=${campaign.slug}&qty=${campaign.preset_quantity}`;

  return NextResponse.redirect(url, { status: 302 });
}
