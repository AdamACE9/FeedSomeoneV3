import { adminDb, currentUser } from "@/lib/supabase/server";
import KitchensClient from "./KitchensClient";

export const metadata = { title: "Kitchens — FeedSomeone Ops" };

export default async function KitchensPage() {
  const db = adminDb();
  const user = await currentUser();

  const { data: kitchens } = await db
    .from("kitchens")
    .select("id, name, city, country_code, tz, contact_email, enabled, created_at")
    .order("created_at", { ascending: false });

  const { data: countries } = await db
    .from("countries")
    .select("code, name")
    .eq("enabled", true)
    .order("name");

  // Photo counts per kitchen
  const kitchenIds = (kitchens ?? []).map((k) => k.id as string);
  const photoCounts: Record<string, { total: number; today: number }> = {};

  if (kitchenIds.length > 0) {
    const { data: allPhotos } = await db
      .from("photos")
      .select("kitchen_id, taken_at")
      .in("kitchen_id", kitchenIds);

    const todayIST = new Date();
    const istMs = todayIST.getTime() + (5 * 60 + 30) * 60 * 1000;
    const istDate = new Date(istMs);
    const todayYmd = istDate.toISOString().slice(0, 10);

    for (const ph of allPhotos ?? []) {
      const kid = ph.kitchen_id as string;
      if (!photoCounts[kid]) photoCounts[kid] = { total: 0, today: 0 };
      photoCounts[kid].total++;
      const takenDate = new Date(ph.taken_at as string);
      const phIst = new Date(takenDate.getTime() + (5 * 60 + 30) * 60 * 1000);
      if (phIst.toISOString().slice(0, 10) === todayYmd) photoCounts[kid].today++;
    }
  }

  return (
    <KitchensClient
      kitchens={(kitchens ?? []).map((k) => ({
        id: k.id as string,
        name: k.name as string,
        city: k.city as string,
        countryCode: k.country_code as string,
        tz: k.tz as string,
        contactEmail: k.contact_email as string | null,
        enabled: k.enabled as boolean,
        createdAt: k.created_at as string,
        photosTotal: photoCounts[k.id as string]?.total ?? 0,
        photosToday: photoCounts[k.id as string]?.today ?? 0,
      }))}
      countries={(countries ?? []).map((c) => ({ code: c.code as string, name: c.name as string }))}
      actorEmail={user?.email ?? "admin"}
    />
  );
}
