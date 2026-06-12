import { adminDb, currentUser } from "@/lib/supabase/server";
import PhotosClient from "./PhotosClient";

export const metadata = { title: "Photos — FeedSomeone Ops" };

type Status = "available" | "flagged" | "assigned" | "delivered" | "rejected";

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status: Status =
    (["available", "flagged", "assigned", "delivered", "rejected"].includes(params.status ?? "")
      ? params.status
      : "available") as Status;

  const db = adminDb();

  // Fetch photos with kitchen name + signed URLs
  const { data: photos } = await db
    .from("photos")
    .select("id, storage_path, blurred_path, kitchen_id, status, taken_at, tz, dup_of, kitchens(name, city)")
    .eq("status", status)
    .order("taken_at", { ascending: false })
    .limit(100);

  // Sign URLs (1 hour)
  const signed: Array<{
    id: string;
    url: string;
    blurredUrl: string | null;
    kitchenName: string;
    takenAt: string;
    tz: string;
    dupOf: string | null;
    status: string;
    storagePath: string;
  }> = [];

  for (const ph of photos ?? []) {
    const path = (ph.blurred_path ?? ph.storage_path) as string;
    const { data: s } = await db.storage.from("photos").createSignedUrl(path, 3600);
    let blurredUrl: string | null = null;
    if (ph.blurred_path) {
      const { data: bs } = await db.storage.from("photos").createSignedUrl(ph.blurred_path as string, 3600);
      blurredUrl = bs?.signedUrl ?? null;
    }
    const kitchen = ph.kitchens as unknown as { name: string; city: string } | null;
    signed.push({
      id: ph.id as string,
      url: s?.signedUrl ?? "",
      blurredUrl,
      kitchenName: kitchen ? `${kitchen.name}, ${kitchen.city}` : "Unknown kitchen",
      takenAt: ph.taken_at as string,
      tz: ph.tz as string,
      dupOf: (ph.dup_of as string | null) ?? null,
      status: ph.status as string,
      storagePath: ph.storage_path as string,
    });
  }

  // For flagged: also get the dup_of photo's signed URL
  const dupSignedMap: Record<string, string> = {};
  if (status === "flagged") {
    const dupIds = [...new Set(signed.map((p) => p.dupOf).filter(Boolean))] as string[];
    for (const dupId of dupIds) {
      const { data: dup } = await db
        .from("photos")
        .select("storage_path, blurred_path")
        .eq("id", dupId)
        .single();
      if (dup) {
        const p = (dup.blurred_path ?? dup.storage_path) as string;
        const { data: ds } = await db.storage.from("photos").createSignedUrl(p, 3600);
        if (ds?.signedUrl) dupSignedMap[dupId] = ds.signedUrl;
      }
    }
  }

  const user = await currentUser();

  return (
    <PhotosClient
      photos={signed}
      status={status}
      dupSignedMap={dupSignedMap}
      actorEmail={user?.email ?? "admin"}
    />
  );
}
