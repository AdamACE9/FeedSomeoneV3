import sharp from "sharp";

/**
 * Privacy blur: center-focus composite.
 * Sharp pipeline: build a blurred base, then overlay the original
 * through a radial-gradient mask so the center stays crisp
 * and edges dissolve into blur.
 */
export async function applyPrivacyBlur(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 800;
  const h = meta.height ?? 600;

  // Blurred background layer
  const blurred = await sharp(buf).blur(16).toBuffer();

  // Radial SVG mask: white (opaque) center ~55% fading to black (transparent)
  const rx = Math.round(w * 0.55 * 0.5);
  const ry = Math.round(h * 0.55 * 0.5);
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);

  const maskSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stop-color="white" stop-opacity="1"/>
          <stop offset="60%" stop-color="white" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="black" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#g)"/>
    </svg>`,
  );

  // The sharp original masked by the radial gradient (keep sharp center)
  const sharpCenter = await sharp(buf)
    .composite([{ input: maskSvg, blend: "dest-in" }])
    .toBuffer();

  // Composite the sharp center over the blurred background
  const result = await sharp(blurred)
    .composite([{ input: sharpCenter, blend: "over" }])
    .jpeg({ quality: 88 })
    .toBuffer();

  return result;
}
