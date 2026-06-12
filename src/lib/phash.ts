import sharp from "sharp";

/**
 * 64-bit dHash via sharp.
 * Each row: compare pixel[r][c] > pixel[r][c+1] → '1' else '0'.
 * 8 rows × 8 comparisons = 64 bits → 64-char '0'/'1' string.
 */
export async function dhash(buf: Buffer): Promise<string> {
  // 9×8 pixels: 9 wide so we get 8 adjacent-pair comparisons per row
  const raw = await sharp(buf)
    .rotate() // honour EXIF orientation
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  let hash = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = raw[row * 9 + col];
      const right = raw[row * 9 + col + 1];
      hash += left > right ? "1" : "0";
    }
  }
  return hash;
}

/** Hamming-distance threshold for duplicate detection. */
export const DUP_THRESHOLD = 6;
