import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { adminDb, currentUser } from "@/lib/supabase/server";
import { dhash, DUP_THRESHOLD } from "@/lib/phash";

export const runtime = "nodejs";

// Supabase returns `data` and `error` but doesn't expose a typed rpc for
// custom functions in the placeholder types — cast via any is intentional here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function POST(req: NextRequest) {
  // ── auth guard ──────────────────────────────────────────────────────────
  const user = await currentUser();
  if (!user || user.role !== "kitchen" || !user.kitchenId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kitchenId = user.kitchenId;
  const db: AnyClient = adminDb();

  // ── load kitchen ────────────────────────────────────────────────────────
  const { data: kitchen, error: kitchenErr } = await db
    .from("kitchens")
    .select("tz, country_code, enabled")
    .eq("id", kitchenId)
    .maybeSingle();

  if (kitchenErr || !kitchen) {
    return NextResponse.json({ error: "Kitchen not found" }, { status: 403 });
  }
  if (!kitchen.enabled) {
    return NextResponse.json({ error: "Kitchen is disabled" }, { status: 403 });
  }

  // ── parse form data ─────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const files = formData.getAll("files[]") as File[];
  const noteRaw = (formData.get("note") as string | null) ?? null;
  const note = noteRaw ? noteRaw.slice(0, 140) || null : null;

  if (!files.length || files.length > 10) {
    return NextResponse.json({ error: "Send 1–10 images" }, { status: 400 });
  }

  // ── process each file ───────────────────────────────────────────────────
  const results: Array<{
    ok: boolean;
    photoId?: string;
    status?: string;
    dupOf?: string;
    error?: string;
  }> = [];

  for (const file of files) {
    try {
      const arrayBuf = await file.arrayBuffer();
      const inputBuf = Buffer.from(arrayBuf);

      // Process image: auto-rotate (EXIF), resize, jpeg
      const processed = await sharp(inputBuf)
        .rotate()
        .resize(1600, undefined, { withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();

      // Upload to storage
      const storagePath = `${kitchenId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadErr } = await db.storage
        .from("photos")
        .upload(storagePath, processed, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadErr) {
        results.push({ ok: false, error: uploadErr.message });
        continue;
      }

      // Compute dHash
      const hash = await dhash(inputBuf);

      // Duplicate check
      let photoStatus: "available" | "flagged" = "available";
      let dupOf: string | undefined;

      const { data: dupRows } = await db.rpc("find_similar_photo", {
        p_hash: hash,
        p_threshold: DUP_THRESHOLD,
      });

      if (dupRows && dupRows.length > 0) {
        photoStatus = "flagged";
        dupOf = dupRows[0].id as string;
      }

      // taken_at = upload moment (real wall-clock, never test clock)
      const takenAt = new Date().toISOString();

      // Insert photos row
      const { data: inserted, error: insertErr } = await db
        .from("photos")
        .insert({
          kitchen_id: kitchenId,
          country_code: kitchen.country_code,
          storage_path: storagePath,
          kitchen_note: note,
          taken_at: takenAt,
          tz: kitchen.tz,
          phash: hash,
          status: photoStatus,
          dup_of: dupOf ?? null,
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        results.push({ ok: false, error: insertErr?.message ?? "Insert failed" });
        continue;
      }

      results.push({
        ok: true,
        photoId: inserted.id as string,
        status: photoStatus,
        ...(dupOf ? { dupOf } : {}),
      });
    } catch (err) {
      results.push({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ results });
}
