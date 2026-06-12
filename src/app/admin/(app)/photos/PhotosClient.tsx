"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Photo = {
  id: string;
  url: string;
  blurredUrl: string | null;
  kitchenName: string;
  takenAt: string;
  tz: string;
  dupOf: string | null;
  status: string;
  storagePath: string;
};

const STATUSES = ["available", "flagged", "assigned", "delivered", "rejected"] as const;

function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function PhotoSheet({
  photo,
  actorEmail,
  onClose,
}: {
  photo: Photo;
  actorEmail: string;
  onClose: () => void;
}) {
  const [donorEmail, setDonorEmail] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function doBlur() {
    startTransition(async () => {
      const { blurPhotoAction } = await import("@/lib/admin-actions");
      const res = await blurPhotoAction(actorEmail, photo.id);
      if ("error" in res && res.error) setMsg({ type: "err", text: res.error });
      else { setMsg({ type: "ok", text: "Privacy blur applied." }); router.refresh(); }
    });
  }

  function doForceSend(e: React.FormEvent) {
    e.preventDefault();
    if (!donorEmail) return;
    startTransition(async () => {
      const { forceSendPhotoAction } = await import("@/lib/admin-actions");
      const res = await forceSendPhotoAction(actorEmail, photo.id, donorEmail);
      if ("error" in res && res.error) setMsg({ type: "err", text: res.error });
      else { setMsg({ type: "ok", text: "Sent." }); router.refresh(); }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-paper border border-line rounded-t-2xl md:rounded-lg w-full md:max-w-lg max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-3">
          <p className="timestamp text-ink/50">{photo.status.toUpperCase()}</p>
          <button onClick={onClose} className="text-xl leading-none text-ink/40 hover:text-ink">×</button>
        </div>
        <img src={photo.url} alt="Photo" className="w-full rounded border border-line mb-3" />
        <p className="timestamp text-xs text-ink/50 mb-1">{photo.kitchenName}</p>
        <p className="timestamp text-xs text-ink/50 mb-4">{fmtDate(photo.takenAt, photo.tz)}</p>

        {photo.blurredUrl && (
          <div className="mb-3 px-3 py-1 bg-leaf/10 border border-leaf/30 rounded inline-block">
            <span className="timestamp text-xs text-leaf">PRIVACY BLUR APPLIED</span>
          </div>
        )}

        {msg && (
          <p className={`mb-3 text-sm ${msg.type === "err" ? "text-clay" : "text-leaf"}`}>
            {msg.text}
          </p>
        )}

        <div className="space-y-3">
          {!photo.blurredUrl && (
            <button
              onClick={doBlur}
              disabled={pending}
              className="w-full border border-line rounded px-4 py-3 min-h-[44px] text-sm hover:bg-sand transition-colors disabled:opacity-50"
            >
              Apply privacy blur
            </button>
          )}

          {photo.status === "available" && (
            <form onSubmit={doForceSend} className="space-y-2">
              <input
                type="email"
                required
                placeholder="Donor email for force-send"
                value={donorEmail}
                onChange={(e) => setDonorEmail(e.target.value)}
                className="w-full border border-line rounded px-3 py-2 text-sm text-ink bg-paper focus:outline-none focus:border-clay"
              />
              <button
                type="submit"
                disabled={pending}
                className="w-full bg-clay text-paper rounded px-4 py-3 min-h-[44px] text-sm font-medium hover:bg-clay-deep transition-colors disabled:opacity-50"
              >
                Force-send to donor
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PhotosClient({
  photos,
  status,
  dupSignedMap,
  actorEmail,
}: {
  photos: Photo[];
  status: string;
  dupSignedMap: Record<string, string>;
  actorEmail: string;
}) {
  const [selected, setSelected] = useState<Photo | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function doRelease(photoId: string) {
    startTransition(async () => {
      const { releasePhotoAction } = await import("@/lib/admin-actions");
      await releasePhotoAction(actorEmail, photoId);
      router.refresh();
    });
  }

  function doReject(photoId: string) {
    startTransition(async () => {
      const { rejectPhotoAction } = await import("@/lib/admin-actions");
      await rejectPhotoAction(actorEmail, photoId);
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="font-[family-name:var(--font-fraunces)] font-black text-2xl mb-4">Photos</h2>

      {/* Status filter chips */}
      <div className="flex gap-2 flex-wrap mb-6">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/photos?status=${s}`}
            className={`px-3 py-1.5 rounded-full text-sm min-h-[36px] flex items-center transition-colors ${
              s === status
                ? "bg-clay text-paper"
                : "bg-sand border border-line text-ink hover:border-clay"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {/* Flagged dup review mode */}
      {status === "flagged" && photos.length > 0 && (
        <div className="space-y-6 mb-6">
          <p className="text-sm text-ink/60">Review potential duplicates.</p>
          {photos.map((ph) => (
            <div key={ph.id} className="border border-line rounded p-4">
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="timestamp text-[10px] text-ink/50 mb-1">FLAGGED</p>
                  <img src={ph.url} alt="Flagged" className="w-full rounded border border-line" />
                  <p className="timestamp text-[10px] text-ink/40 mt-1">{fmtDate(ph.takenAt, ph.tz)}</p>
                </div>
                {ph.dupOf && dupSignedMap[ph.dupOf] && (
                  <div>
                    <p className="timestamp text-[10px] text-ink/50 mb-1">ORIGINAL</p>
                    <img src={dupSignedMap[ph.dupOf]} alt="Original" className="w-full rounded border border-line" />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => doRelease(ph.id)}
                  disabled={pending}
                  className="flex-1 border border-leaf text-leaf rounded px-3 py-2.5 min-h-[44px] text-sm hover:bg-leaf/10 transition-colors disabled:opacity-50"
                >
                  Not a duplicate → release
                </button>
                <button
                  onClick={() => doReject(ph.id)}
                  disabled={pending}
                  className="flex-1 border border-clay text-clay rounded px-3 py-2.5 min-h-[44px] text-sm hover:bg-clay/10 transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Normal photo grid */}
      {status !== "flagged" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((ph) => (
            <button
              key={ph.id}
              onClick={() => setSelected(ph)}
              className="text-left border border-line rounded overflow-hidden hover:border-clay transition-colors"
            >
              <div className="aspect-square relative bg-sand overflow-hidden">
                <img
                  src={ph.url}
                  alt=""
                  className="w-full h-full object-cover"
                />
                {ph.blurredUrl && (
                  <div className="absolute bottom-1 right-1 bg-leaf/90 rounded px-1">
                    <span className="timestamp text-paper text-[9px]">BLURRED</span>
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="text-xs text-ink truncate">{ph.kitchenName}</p>
                <p className="timestamp text-[10px] text-ink/50">{fmtDate(ph.takenAt, ph.tz)}</p>
              </div>
            </button>
          ))}
          {photos.length === 0 && (
            <p className="col-span-full text-sm text-ink/50 py-8 text-center">No photos in this status.</p>
          )}
        </div>
      )}

      {/* Detail sheet */}
      {selected && (
        <PhotoSheet
          photo={selected}
          actorEmail={actorEmail}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
