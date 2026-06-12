import QRCode from "qrcode";

/**
 * Generate a QR code PNG buffer.
 * dark = ink, light = paper — matches brand palette.
 */
export async function qrPngBuffer(url: string): Promise<Buffer> {
  const buf = await QRCode.toBuffer(url, {
    type: "png",
    width: 512,
    margin: 2,
    color: {
      dark: "#211511",
      light: "#FFFDF9",
    },
  });
  return buf as Buffer;
}
