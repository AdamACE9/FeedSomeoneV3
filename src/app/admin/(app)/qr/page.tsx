import { adminDb, currentUser } from "@/lib/supabase/server";
import QrClient from "./QrClient";

export const metadata = { title: "QR Campaigns — FeedSomeone Ops" };

export default async function QrPage() {
  const db = adminDb();
  const user = await currentUser();

  const { data: campaigns } = await db
    .from("qr_campaigns")
    .select("id, slug, name, preset_quantity, scans, created_at, kitchen_id")
    .order("created_at", { ascending: false });

  const { data: kitchens } = await db
    .from("kitchens")
    .select("id, name")
    .eq("enabled", true)
    .order("name");

  return (
    <QrClient
      campaigns={(campaigns ?? []).map((c) => ({
        id: c.id as string,
        slug: c.slug as string,
        name: c.name as string,
        presetQuantity: c.preset_quantity as number,
        scans: c.scans as number,
        createdAt: c.created_at as string,
      }))}
      kitchens={(kitchens ?? []).map((k) => ({ id: k.id as string, name: k.name as string }))}
      actorEmail={user?.email ?? "admin"}
    />
  );
}
