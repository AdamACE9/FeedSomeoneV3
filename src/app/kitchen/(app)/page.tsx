import { adminDb, currentUser } from "@/lib/supabase/server";
import { Uploader } from "@/components/kitchen/Uploader";
import { formatInTimeZone } from "date-fns-tz";
import { startOfDay } from "date-fns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export default async function KitchenPage() {
  const user = await currentUser();
  // layout already guards; narrow type for TS
  if (!user || user.role !== "kitchen" || !user.kitchenId) return null;

  const kitchenId = user.kitchenId;
  const db: AnyClient = adminDb();

  // ── load kitchen tz ──────────────────────────────────────────────────────
  const { data: kitchen } = await db
    .from("kitchens")
    .select("tz")
    .eq("id", kitchenId)
    .maybeSingle();

  const tz: string = kitchen?.tz ?? "Asia/Kolkata";

  // ── today count (kitchen's local date) ──────────────────────────────────
  const todayStart = formatInTimeZone(
    startOfDay(new Date()),
    tz,
    "yyyy-MM-dd'T'HH:mm:ssxxx",
  );

  const { count: todayCount } = await db
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("kitchen_id", kitchenId)
    .gte("created_at", todayStart);

  // ── all-time count ───────────────────────────────────────────────────────
  const { count: allTimeCount } = await db
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("kitchen_id", kitchenId);

  // ── last 6 uploads with signed thumbnails ───────────────────────────────
  const { data: recent } = await db
    .from("photos")
    .select("id, storage_path, taken_at, tz")
    .eq("kitchen_id", kitchenId)
    .order("created_at", { ascending: false })
    .limit(6);

  type RecentPhoto = {
    id: string;
    storage_path: string;
    taken_at: string;
    tz: string;
    signedUrl: string | null;
    timeLabel: string;
  };

  const recentPhotos: RecentPhoto[] = await Promise.all(
    (recent ?? []).map(async (row: { id: string; storage_path: string; taken_at: string; tz: string }) => {
      const { data: signed } = await adminDb()
        .storage.from("photos")
        .createSignedUrl(row.storage_path, 3600);

      const timeLabel = formatInTimeZone(
        new Date(row.taken_at),
        row.tz ?? tz,
        "HH:mm",
      );

      return {
        ...row,
        signedUrl: signed?.signedUrl ?? null,
        timeLabel,
      };
    }),
  );

  return (
    <Uploader
      todayCount={todayCount ?? 0}
      allTimeCount={allTimeCount ?? 0}
      recentPhotos={recentPhotos}
    />
  );
}
