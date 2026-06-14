"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface RecentPhoto {
  id: string;
  storage_path: string;
  taken_at: string;
  tz: string;
  signedUrl: string | null;
  timeLabel: string;
}

interface UploadResult {
  ok: boolean;
  photoId?: string;
  status?: string;
  dupOf?: string;
  error?: string;
}

interface FileResult {
  name: string;
  previewUrl: string;
  result: UploadResult | null;
  uploading: boolean;
}

interface QueuedBatch {
  id: string;
  dataUrls: string[];
  note: string | null;
  createdAt: number;
}

const QUEUE_KEY = "fs_kitchen_queue";
const MAX_QUEUE_BYTES = 8 * 1024 * 1024; // 8 MB

/* ── Helpers ────────────────────────────────────────────────────────────── */

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

function loadQueue(): QueuedBatch[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedBatch[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage full — silently ignore */
  }
}

async function sendBatch(dataUrls: string[], note: string | null): Promise<UploadResult[]> {
  const fd = new FormData();
  dataUrls.forEach((du, i) => {
    const blob = dataUrlToBlob(du);
    fd.append("files[]", blob, `photo_${i}.jpg`);
  });
  if (note) fd.append("note", note);

  const res = await fetch("/api/photos/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.results as UploadResult[];
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function Uploader({
  todayCount,
  allTimeCount,
  waitingCount,
  recentPhotos,
}: {
  todayCount: number;
  allTimeCount: number;
  waitingCount: number;
  recentPhotos: RecentPhoto[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<FileResult[]>([]);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [queuedBatches, setQueuedBatches] = useState<QueuedBatch[]>([]);
  const [queuePending, setQueuePending] = useState(false);

  // Keep total queued photo count
  const queuedPhotoCount = queuedBatches.reduce(
    (sum, b) => sum + b.dataUrls.length,
    0,
  );

  // ── Load queue on mount ───────────────────────────────────────────────
  useEffect(() => {
    setQueuedBatches(loadQueue());
  }, []);

  // ── Retry queued batches on online event or mount ─────────────────────
  const retryQueue = useCallback(async () => {
    const q = loadQueue();
    if (!q.length || !navigator.onLine) return;
    setQueuePending(true);
    const remaining: QueuedBatch[] = [];
    for (const batch of q) {
      try {
        await sendBatch(batch.dataUrls, batch.note);
        // success — don't re-add
      } catch {
        remaining.push(batch);
      }
    }
    saveQueue(remaining);
    setQueuedBatches(remaining);
    setQueuePending(false);
  }, []);

  useEffect(() => {
    retryQueue();
    window.addEventListener("online", retryQueue);
    return () => window.removeEventListener("online", retryQueue);
  }, [retryQueue]);

  // ── File selection ────────────────────────────────────────────────────
  function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const arr = Array.from(files);
    setSelectedFiles(arr);
    setSuccessCount(null);

    const initial: FileResult[] = arr.map((f) => ({
      name: f.name,
      previewUrl: URL.createObjectURL(f),
      result: null,
      uploading: false,
    }));
    setPreviews(initial);
  }

  // ── Upload ────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!selectedFiles.length || uploading) return;
    setUploading(true);

    // Mark all as uploading
    setPreviews((prev) =>
      prev.map((p) => ({ ...p, uploading: true })),
    );

    const noteVal = note.trim() || null;

    // Offline path
    if (!navigator.onLine) {
      // Compute total queued bytes to check cap
      const current = loadQueue();
      const currentBytes = current.reduce(
        (s, b) => s + b.dataUrls.join("").length,
        0,
      );

      const dataUrls: string[] = [];
      let overBudget = false;
      let accBytes = currentBytes;

      for (const file of selectedFiles) {
        const du = await readFileAsDataUrl(file);
        const bytes = du.length;
        if (accBytes + bytes > MAX_QUEUE_BYTES) {
          overBudget = true;
          // keep file only in memory (don't store in localStorage)
          dataUrls.push(du);
        } else {
          dataUrls.push(du);
          accBytes += bytes;
        }
      }

      const batch: QueuedBatch = {
        id: crypto.randomUUID(),
        dataUrls: overBudget
          ? [] // in-memory only — just track count
          : dataUrls,
        note: noteVal,
        createdAt: Date.now(),
      };

      if (!overBudget) {
        const updated = [...current, batch];
        saveQueue(updated);
        setQueuedBatches(updated);
      } else {
        // Show in-memory warning via UI but still keep in state (will retry when back online)
        const inMemBatch: QueuedBatch = {
          ...batch,
          dataUrls, // kept in memory, not localStorage
        };
        setQueuedBatches((prev) => [...prev, inMemBatch]);
      }

      setPreviews((prev) =>
        prev.map((p) => ({
          ...p,
          uploading: false,
          result: { ok: false, error: "offline" },
        })),
      );
      setUploading(false);
      return;
    }

    // Online path
    const fd = new FormData();
    selectedFiles.forEach((f) => fd.append("files[]", f));
    if (noteVal) fd.append("note", noteVal);

    try {
      const res = await fetch("/api/photos/upload", { method: "POST", body: fd });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        setPreviews((prev) =>
          prev.map((p) => ({
            ...p,
            uploading: false,
            result: { ok: false, error: errText },
          })),
        );
        setUploading(false);
        return;
      }

      const json = await res.json();
      const results: UploadResult[] = json.results ?? [];

      setPreviews((prev) =>
        prev.map((p, i) => ({
          ...p,
          uploading: false,
          result: results[i] ?? { ok: false, error: "No result" },
        })),
      );

      const okCount = results.filter((r) => r.ok).length;
      if (okCount > 0) {
        setSuccessCount(okCount);
        // Reset after 4 seconds
        setTimeout(() => {
          setSuccessCount(null);
          setSelectedFiles([]);
          setPreviews([]);
          setNote("");
          if (fileInputRef.current) fileInputRef.current.value = "";
        }, 4000);
      }
    } catch {
      // Network error — queue the batch
      const dataUrls = await Promise.all(selectedFiles.map(readFileAsDataUrl));
      const current = loadQueue();
      const batch: QueuedBatch = {
        id: crypto.randomUUID(),
        dataUrls,
        note: noteVal,
        createdAt: Date.now(),
      };
      const updated = [...current, batch];
      saveQueue(updated);
      setQueuedBatches(updated);

      setPreviews((prev) =>
        prev.map((p) => ({
          ...p,
          uploading: false,
          result: { ok: false, error: "offline" },
        })),
      );
    }

    setUploading(false);
  }

  // ── Success state ─────────────────────────────────────────────────────
  if (successCount !== null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center border-4 border-leaf"
          style={{ color: "var(--color-leaf)" }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 40 40" fill="none" width="40" height="40" aria-hidden="true">
            <polyline
              points="8,22 17,31 32,12"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p
          className="text-xl font-black text-ink"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          {successCount} meal{successCount !== 1 ? "s" : ""} now have a donor's inbox waiting.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-5 pb-10 max-w-sm mx-auto">
      {/* ── Demand: donors waiting for a photo right now ─────────────────── */}
      {waitingCount > 0 ? (
        <div className="bg-clay text-paper px-4 py-3.5">
          <div className="text-3xl font-bold" style={{ fontFamily: "var(--font-dm-mono)" }}>
            {waitingCount}
          </div>
          <div className="text-[13px] leading-snug mt-1 text-paper/90" style={{ fontFamily: "var(--font-dm-mono)" }}>
            {waitingCount === 1 ? "child is waiting" : "children are waiting"} for a meal photo. Cook, serve, and photograph to feed them.
          </div>
        </div>
      ) : (
        <div className="bg-leaf/10 border border-leaf/30 px-4 py-3 text-[13px] text-leaf" style={{ fontFamily: "var(--font-dm-mono)" }}>
          All caught up — every waiting donor has a photo. Keep photographing as you serve.
        </div>
      )}

      {/* ── Stat chips ──────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <div className="flex-1 bg-sand border border-line px-4 py-3">
          <div
            className="text-2xl font-bold text-ink"
            style={{ fontFamily: "var(--font-dm-mono)" }}
          >
            {todayCount}
          </div>
          <div
            className="text-xs text-ink/50 mt-0.5"
            style={{ fontFamily: "var(--font-dm-mono)" }}
          >
            Today
          </div>
        </div>
        <div className="flex-1 bg-sand border border-line px-4 py-3">
          <div
            className="text-2xl font-bold text-ink"
            style={{ fontFamily: "var(--font-dm-mono)" }}
          >
            {allTimeCount}
          </div>
          <div
            className="text-xs text-ink/50 mt-0.5"
            style={{ fontFamily: "var(--font-dm-mono)" }}
          >
            All-time
          </div>
        </div>
      </div>

      {/* ── Offline queue pill ───────────────────────────────────────────── */}
      {queuedPhotoCount > 0 && (
        <div
          className="bg-marigold/20 border border-marigold px-4 py-3 text-xs text-ink"
          style={{ fontFamily: "var(--font-dm-mono)" }}
          role="status"
          aria-live="polite"
        >
          {queuePending
            ? `Uploading ${queuedPhotoCount} queued photo${queuedPhotoCount !== 1 ? "s" : ""}…`
            : `Waiting for signal — ${queuedPhotoCount} photo${queuedPhotoCount !== 1 ? "s" : ""} safe on this phone`}
        </div>
      )}

      {/* ── Giant capture button ─────────────────────────────────────────── */}
      {!previews.length && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full min-h-[200px] bg-clay text-paper flex flex-col items-center justify-center gap-2 active:scale-[0.99] transition-transform"
          aria-label="Open camera to photograph the meal"
        >
          <span
            className="text-xl font-black"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Photograph the meal
          </span>
          <span
            className="text-sm opacity-75"
            style={{ fontFamily: "var(--font-dm-mono)" }}
          >
            Tap right after you serve
          </span>
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* ── Selected files: previews + results ──────────────────────────── */}
      {previews.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {previews.map((pv, i) => (
              <div key={i} className="relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pv.previewUrl}
                  alt={`Preview ${i + 1}`}
                  className="w-full h-full object-cover border border-line"
                />
                {/* Result chip overlay */}
                {pv.result && (
                  <div
                    className={[
                      "absolute bottom-0 left-0 right-0 px-1 py-0.5 text-center",
                      "text-paper text-xs",
                      pv.result.ok && pv.result.status === "available"
                        ? "bg-leaf/90"
                        : pv.result.ok && pv.result.status === "flagged"
                          ? "bg-marigold/90"
                          : pv.result.error === "offline"
                            ? "bg-ink/60"
                            : "bg-clay/90",
                    ].join(" ")}
                    style={{ fontFamily: "var(--font-dm-mono)" }}
                  >
                    {pv.result.ok && pv.result.status === "available"
                      ? "uploaded"
                      : pv.result.ok && pv.result.status === "flagged"
                        ? "flagged"
                        : pv.result.error === "offline"
                          ? "queued"
                          : "retry"}
                  </div>
                )}
                {pv.uploading && (
                  <div className="absolute inset-0 bg-paper/60 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-clay border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Note input */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="kitchen-note"
              className="text-xs text-ink/50"
              style={{ fontFamily: "var(--font-dm-mono)" }}
            >
              One line for the donor — optional
            </label>
            <input
              id="kitchen-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 140))}
              maxLength={140}
              disabled={uploading}
              className="h-12 px-4 border border-line bg-sand text-ink text-sm focus:outline-none focus:border-clay focus:ring-1 focus:ring-clay disabled:opacity-50"
              placeholder="Dal chawal with seasonal greens"
            />
          </div>

          {/* Upload button */}
          {!previews.every((p) => p.result !== null) && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="h-14 bg-clay text-paper text-base font-medium active:scale-[0.99] transition-transform disabled:opacity-60"
            >
              {uploading
                ? "Uploading…"
                : `Upload ${previews.length} photo${previews.length !== 1 ? "s" : ""}`}
            </button>
          )}

          {/* Pick again */}
          {previews.every((p) => p.result !== null) && (
            <button
              type="button"
              onClick={() => {
                setSelectedFiles([]);
                setPreviews([]);
                setNote("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="h-12 border border-line text-ink text-sm active:scale-[0.99] transition-transform"
              style={{ fontFamily: "var(--font-dm-mono)" }}
            >
              Take another photo
            </button>
          )}
        </>
      )}

      {/* ── Recent uploads strip ─────────────────────────────────────────── */}
      {recentPhotos.length > 0 && (
        <section aria-label="Recent uploads">
          <h2
            className="text-xs text-ink/40 mb-3 uppercase tracking-widest"
            style={{ fontFamily: "var(--font-dm-mono)" }}
          >
            Recent
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {recentPhotos.map((rp) => (
              <div key={rp.id} className="flex flex-col gap-1">
                <div className="aspect-square bg-sand border border-line overflow-hidden">
                  {rp.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={rp.signedUrl}
                      alt="Recent meal photo"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-sand" />
                  )}
                </div>
                <span className="timestamp text-ink/50">{rp.timeLabel}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
