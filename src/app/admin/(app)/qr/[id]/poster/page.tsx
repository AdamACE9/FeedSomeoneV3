import { adminDb, currentUser } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { qrPngBuffer } from "@/lib/qr";
import PrintButton from "./PrintButton";

export default async function QrPosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user || user.role !== "admin") redirect("/admin/login");

  const { id } = await params;
  const db = adminDb();

  const { data: campaign } = await db
    .from("qr_campaigns")
    .select("id, slug, name, preset_quantity")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const qrUrl = `${site}/q/${campaign.slug}`;
  const pngBuf = await qrPngBuffer(qrUrl);
  const base64 = pngBuf.toString("base64");

  return (
    <div>
      {/* Print button (no-print) */}
      <div className="no-print flex gap-3 mb-4 p-4">
        <PrintButton />
        <a href="/admin/qr" className="text-sm text-ink/60 hover:text-ink self-center">
          ← Back to QR
        </a>
      </div>

      {/* A5 poster */}
      <style>{`
        @page { size: A5 portrait; margin: 0; }
        @media print { .no-print { display: none !important; } body { background: #F3EBDD; } }
      `}</style>

      <div
        className="poster mx-auto"
        style={{
          width: "148mm",
          minHeight: "210mm",
          background: "#F3EBDD",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24mm 16mm",
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            fontWeight: 900,
            fontSize: "32px",
            color: "#211511",
            marginBottom: "12px",
            textAlign: "center",
            lineHeight: 1.15,
          }}
        >
          Feed one child.
        </p>
        <p
          style={{
            fontFamily: "var(--font-dm-mono), 'Courier New', monospace",
            fontSize: "14px",
            color: "#211511",
            marginBottom: "32px",
            textAlign: "center",
            letterSpacing: "0.04em",
          }}
        >
          Scan. ₹25. A child eats.
        </p>

        {/* QR code */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${base64}`}
          alt={`QR code for ${campaign.name}`}
          style={{ width: "140px", height: "140px", display: "block" }}
        />

        <p
          style={{
            fontFamily: "var(--font-dm-mono), 'Courier New', monospace",
            fontSize: "11px",
            color: "#8a7a6d",
            marginTop: "32px",
            textAlign: "center",
            letterSpacing: "0.08em",
          }}
        >
          feedsomeone.org
        </p>
      </div>
    </div>
  );
}
