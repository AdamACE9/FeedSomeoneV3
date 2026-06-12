import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { adminDb, currentUser, serverClient } from "@/lib/supabase/server";
import { getReceiptBundle } from "@/lib/receipts";
import { formatMoney, isCurrency } from "@/lib/money";
import { countWords } from "@/lib/email/render";

export const dynamic = "force-dynamic";

const INK = rgb(0.13, 0.082, 0.067);
const CLAY = rgb(0.769, 0.278, 0.114);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ number: string }> },
): Promise<NextResponse> {
  const { number } = await context.params;

  /* ── load receipt ──────────────────────────────────────────────────── */
  const db = adminDb();
  const { data: receiptRow } = await db
    .from("receipts")
    .select("donation_id")
    .eq("number", number)
    .maybeSingle();

  if (!receiptRow) {
    return new NextResponse("Receipt not found.", { status: 404 });
  }

  const bundle = await getReceiptBundle(receiptRow.donation_id as string);
  if (!bundle) {
    return new NextResponse("Receipt data unavailable.", { status: 404 });
  }

  /* ── auth: must be the donor or an admin ───────────────────────────── */
  const supa = await serverClient();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (user) {
    const callerEmail = user.email ?? "";
    // Admin bypass
    const cu = await currentUser();
    const isAdmin = cu?.role === "admin";
    if (!isAdmin && callerEmail.toLowerCase() !== bundle.donor.email.toLowerCase()) {
      return new NextResponse("Unauthorized.", { status: 401 });
    }
  } else {
    return new NextResponse("Unauthorized.", { status: 401 });
  }

  /* ── build PDF ─────────────────────────────────────────────────────── */
  const doc = await PDFDocument.create();
  // A5 portrait: 420 × 595 pt
  const page = doc.addPage([420, 595]);
  const { width, height } = page.getSize();

  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBoldItalic = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const fontMono = await doc.embedFont(StandardFonts.Courier);

  const margin = 36;
  let y = height - margin;

  /* ── header ─────────────────────────────────────────────────────────── */
  page.drawText("FeedSomeone", {
    x: margin,
    y,
    font: fontBold,
    size: 20,
    color: INK,
  });
  y -= 8;

  // thin rule
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.898, 0.851, 0.776), // line #E5D9C6
  });
  y -= 14;

  // receipt number
  page.drawText(bundle.number, {
    x: margin,
    y,
    font: fontMono,
    size: 11,
    color: CLAY,
  });
  y -= 16;

  // date
  const issuedDate = new Date(bundle.issuedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  page.drawText(issuedDate, {
    x: margin,
    y,
    font: fontRegular,
    size: 10,
    color: INK,
  });
  y -= 28;

  /* ── hero text ──────────────────────────────────────────────────────── */
  const qty = bundle.donation.quantity_total;
  const childWord = qty === 1 ? "child" : "children";
  const heroText = `You fed ${countWords(qty)} ${childWord}.`;

  page.drawText(heroText, {
    x: margin,
    y,
    font: fontBold,
    size: 22,
    color: INK,
  });
  y -= 36;

  /* ── table ──────────────────────────────────────────────────────────── */
  const currency = isCurrency(bundle.donation.currency)
    ? bundle.donation.currency
    : "INR";

  const mealsFmt = formatMoney(bundle.donation.amount_local, currency);
  const tipFmt =
    bundle.tip && bundle.tip.amount_local > 0
      ? formatMoney(bundle.tip.amount_local, currency)
      : "—";
  const totalLocal =
    bundle.donation.amount_local + (bundle.tip?.amount_local ?? 0);
  const totalFmt = formatMoney(totalLocal, currency);

  const tableRows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: "Meals", value: mealsFmt },
    { label: "Tip", value: tipFmt },
    { label: "Total", value: totalFmt, bold: true },
  ];

  const colLabel = margin;
  const colValue = width - margin;
  const rowH = 20;

  for (const row of tableRows) {
    const fnt = row.bold ? fontBold : fontRegular;
    const sz = row.bold ? 11 : 10;

    if (row.bold) {
      // thin rule above total
      page.drawLine({
        start: { x: margin, y: y + rowH - 4 },
        end: { x: width - margin, y: y + rowH - 4 },
        thickness: 0.4,
        color: rgb(0.898, 0.851, 0.776),
      });
    }

    page.drawText(row.label, {
      x: colLabel,
      y,
      font: fnt,
      size: sz,
      color: INK,
    });

    const valueWidth = fnt.widthOfTextAtSize(row.value, sz);
    page.drawText(row.value, {
      x: colValue - valueWidth,
      y,
      font: fnt,
      size: sz,
      color: INK,
    });

    y -= rowH;
  }

  y -= 10;

  /* ── dedication ─────────────────────────────────────────────────────── */
  if (bundle.dedication) {
    const dedText = `In ${bundle.dedication.kind === "memory" ? "memory" : "honor"} of ${bundle.dedication.name}.`;
    page.drawText(dedText, {
      x: margin,
      y,
      font: fontBoldItalic,
      size: 10,
      color: INK,
      opacity: 0.7,
    });
    y -= 20;
  }

  /* ── footer ─────────────────────────────────────────────────────────── */
  const footerY = margin + 40;

  page.drawLine({
    start: { x: margin, y: footerY + 14 },
    end: { x: width - margin, y: footerY + 14 },
    thickness: 0.4,
    color: rgb(0.898, 0.851, 0.776),
  });

  page.drawText(
    "We charge no admin fee — 100% of donations feed children. Tips are accounted separately.",
    {
      x: margin,
      y: footerY,
      font: fontRegular,
      size: 9,
      color: INK,
      opacity: 0.6,
    },
  );

  page.drawText("feedsomeone.org · hello@feedsomeone.org", {
    x: margin,
    y: footerY - 14,
    font: fontRegular,
    size: 9,
    color: INK,
    opacity: 0.4,
  });

  /* ── serialise ──────────────────────────────────────────────────────── */
  const pdfBytes = await doc.save();
  const body = Buffer.from(pdfBytes);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
