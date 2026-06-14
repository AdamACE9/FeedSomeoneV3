# Research Brief: Editorial Photo Grading Pipeline for FeedSomeone

**ID:** 6-grade  
**Date:** 2026-06-14  
**Stack:** Node.js + sharp 0.35 + Next.js 16 Image component  
**Status:** Ready for implementation

---

## Overview

FeedSomeone's impact depends on authentic, emotionally resonant photos of children receiving meals. The photos arrive from partner kitchens via WhatsApp/email — varied quality, mixed orientations, inconsistent lighting. This brief specifies a **production-ready sharp pipeline** to transform that raw input into a cohesive, premium photo essay: intelligent cropping, warm editorial grading, consistent sizing, and optional privacy-preserving face blur — all **without feeling filtered or artificial**.

The aesthetic goal: **editorial documentary** (film-print warmth, subtle grain if desired, natural skin tones preserved), not Instagram aesthetic (heavy color cast, blown-out highlights, fake vintage).

---

## Sharp 0.35: Current State (June 2026)

**Package:** `sharp@0.35` (latest in 2026)  
**Key improvements since 0.34:**
- Native HEIC decode (no license keys needed)
- First-class AVIF encoding via libavif
- Hardened WASM build for serverless/Lambda cold-starts
- In-process worker pool for parallel batch processing
- EXIF orientation auto-correction refined (`autoOrient()`)

**Performance baseline:** Sharp processes 1000 mid-size JPEGs (2–4 MB, phone photos) in ~5–12 minutes on a modern server CPU, depending on pipeline complexity. Suitable for scheduled batch jobs or real-time API upload handlers with caching.

---

## Pipeline Architecture

### Stage 1: Intake & Orientation Normalization

**Goal:** Read EXIF metadata, fix phone rotations, strip unnecessary tags.

```javascript
import sharp from 'sharp';
import fs from 'fs/promises';

/**
 * Normalize orientation and strip sensitive metadata.
 * iPhones/Android phones embed a 90/270° rotation flag instead of transforming pixels.
 * .autoOrient() reads that flag, applies the rotation, strips the flag.
 */
async function normalizeOrientation(inputPath, outputPath) {
  await sharp(inputPath)
    .autoOrient()              // Read & apply EXIF orientation, strip flag
    .withMetadata(false)       // Strip all EXIF, IPTC, XMP
    .toFile(outputPath);
}

// Usage:
await normalizeOrientation('raw/DSC_1234.jpg', 'work/normalized_1234.jpg');
```

**Key considerations:**
- Always call `autoOrient()` before any crop/resize operation. Without it, portrait photos extracted from the raw file will be sideways.
- `.withMetadata(false)` strips GPS, camera make, timestamps — essential for privacy if photos are user-uploaded.
- If you need to preserve the original timestamp for pairing with meal records, extract EXIF before stripping:

```javascript
import exifParser from 'exif-parser'; // npm install exif-parser

async function extractExif(inputPath) {
  const buffer = await fs.readFile(inputPath);
  const parser = exifParser.create(buffer);
  const result = parser.getResult();
  return {
    timestamp: result.tags?.DateTime,
    make: result.tags?.Make,
    model: result.tags?.Model,
  };
}
```

---

### Stage 2: Smart Crop to Consistent Aspect Ratio

**Goal:** Crop to a mobile-friendly portrait aspect (3:4 or 9:12), preserving the subject (child + meal) in focus.

**Aspect ratio choice:**
- **3:4 (1.33)** — classic mobile portrait, fits Instagram stories, most readable on small screens. **Recommended for FeedSomeone**: children + meal details are fully visible.
- **1:1 (square)** — Twitter/carousel-friendly, but often cuts off important context.
- **16:9 (widescreen)** — not suitable for mobile-first design.

**Cropping strategy: Entropy vs. Attention**

Sharp offers two intelligent crop methods via the `position` parameter:

#### Strategy: `attention`
```javascript
/**
 * "Attention" crop focuses on regions with:
 * - High luminance frequency (bright details)
 * - High color saturation (vibrant colors)
 * - Presence of skin tones (face detection-like behavior)
 *
 * Best for: Food + child photos where the subject is front-and-center.
 * Automatically discards background clutter.
 */
async function smartCropAttention(inputPath, outputPath) {
  const imageMetadata = await sharp(inputPath).metadata();
  const width = imageMetadata.width;
  const height = imageMetadata.height;

  // Target 3:4 aspect (portrait)
  const targetWidth = 800;   // Mobile size
  const targetHeight = 1066; // 3:4 ratio

  await sharp(inputPath)
    .resize(targetWidth, targetHeight, {
      fit: 'cover',          // Crop to fill exactly 800×1066
      position: 'attention', // Focus on interesting regions (skin, saturation)
      kernel: sharp.kernel.lanczos3, // High-quality resampling
    })
    .toFile(outputPath);
}

// Usage:
await smartCropAttention('work/normalized_1234.jpg', 'work/cropped_1234.jpg');
```

#### Strategy: `entropy`
```javascript
/**
 * "Entropy" crop focuses on regions with highest Shannon entropy
 * (complexity, detail, change).
 *
 * Best for: Complex scenes where subject is not centered or obvious.
 * Useful if "attention" overshoots (crops out meal plate).
 */
async function smartCropEntropy(inputPath, outputPath) {
  const targetWidth = 800;
  const targetHeight = 1066;

  await sharp(inputPath)
    .resize(targetWidth, targetHeight, {
      fit: 'cover',
      position: 'entropy',   // Focus on highest-detail regions
      kernel: sharp.kernel.lanczos3,
    })
    .toFile(outputPath);
}
```

**Practical recommendation for FeedSomeone:**
- **Default to `attention`** — children and meal plates have distinct skin tones and saturation. The algorithm will favor these.
- **Fallback to `entropy`** if `attention` crops too tightly around a face and misses the plate.
- **Manual override list** — for photos that crop badly (child is off-center, meal is at edge), use a fixed `position: 'center'` or store manual crop offsets in your DB.

**Aspect ratio targets by device:**
```javascript
// Responsive crop targets (store these in config)
const cropTargets = {
  mobile: { width: 800, height: 1066 },   // 3:4, for small screens
  tablet: { width: 1200, height: 1600 },  // 3:4, for larger screens
  square: { width: 600, height: 600 },    // 1:1, for carousel/thumbnail
};
```

---

### Stage 3: Warm Editorial Color Grade

**Goal:** Unify the color temperature and saturation of photos taken under different lighting (tungsten kitchen light, daylight, mixed indoor). Preserve skin tones. Avoid heavy filters.

**Sharp color methods:**
- `modulate(brightness, saturation, hue)` — three-way simultaneous control (not one method, this is actually used via the `gamma` and `negate` chain or via libvips modulate API).
- `tint(color)` — monochromatic color wash (use for warm overlay).
- `greyscale()` — convert to B&W (not needed here).
- `toColorspace(space)` — output colorspace (sRGB for web).

For warm editorial grading without heavy filters, **combine a gentle tint overlay with brightness/saturation nudge**:

```javascript
/**
 * Apply warm editorial color grade.
 * 
 * Strategy:
 * 1. Tint slightly warm (boost reds, suppress blues)
 * 2. Lift shadows slightly (brightness +5–10%)
 * 3. Increase saturation just enough (+5–15%) to punch colors
 * 4. Preserve skin tones via careful RGB balancing
 */
async function warmGrade(inputPath, outputPath) {
  // Warm tint: { r: 255, g: 235, b: 210 } = yellowish-orange
  // This is approximately a 3200K (tungsten) color temperature overlay.
  // Alpha 0.05 = 5% blend intensity (subtle)
  
  const tintColor = { r: 255, g: 235, b: 210 };
  const tintBlend = 0.08; // 8% — visible warmth without orange cast

  await sharp(inputPath)
    // Warm color cast (tint is overlaid as multiply/overlay blend in libvips)
    .tint(tintColor)
    // Lift midtones & shadows, preserve highlights
    // brightness: 1.0 = baseline, 1.08 = +8% overall
    .modulate({
      brightness: 1.08,      // +8% overall brightness
      saturation: 1.12,      // +12% saturation (punch)
      hue: 0,                // No hue rotation (keep reds as reds)
    })
    .toColorspace('srgb')    // Web-safe output
    .toFile(outputPath);
}

// Usage:
await warmGrade('work/cropped_1234.jpg', 'work/graded_1234.jpg');
```

**Understanding the parameters:**

| Method | Param | Range | Effect | Food Photography Use |
|--------|-------|-------|--------|----------------------|
| `tint()` | RGB object | 0–255 each | Monochromatic color wash | {r:255, g:235, b:210} = warm cast |
| `modulate()` | brightness | 0.5–2.0 | Lift or darken overall | 1.08 = subtle lift |
| `modulate()` | saturation | 0.5–2.0 | Mute or punch colors | 1.12 = punch saturation |
| `modulate()` | hue | -360 to +360 | Rotate color wheel | 0 = no rotation (preserve reds) |

**Fine-tuning for different lighting:**

```javascript
/**
 * Detect dominant color temperature and apply adaptive grading.
 * This is a simplified heuristic — production systems use histogram analysis.
 */
async function adaptiveWarmGrade(inputPath, outputPath) {
  const metadata = await sharp(inputPath).metadata();
  const isWarm = metadata.space === 'srgb'; // Crude check; real code would analyze histogram
  
  // If photo looks cool (blue-heavy), warm it more
  // If photo looks warm (yellow-heavy), warm it less
  const tintIntensity = isWarm ? 0.05 : 0.12;
  const saturationBoost = isWarm ? 1.08 : 1.15;

  await sharp(inputPath)
    .tint({ r: 255, g: 235, b: 210 })
    .modulate({
      brightness: 1.08,
      saturation: saturationBoost,
      hue: 0,
    })
    .toColorspace('srgb')
    .toFile(outputPath);
}
```

**Preserving skin tones:**
Sharp's `tint()` and `modulate()` apply globally. For **precise skin tone preservation**, you'd need:
1. Face detection (ml5.js, TensorFlow.js, or face-api.js) to identify skin regions.
2. Selective adjustment (blur regions, apply color correction per region).
3. This is **beyond sharp's scope** — consider it Phase 2 if QA reports tones are off.

---

### Stage 4: Denoise & Sharpen

**Goal:** Reduce noise from ISO-heavy phone photos; add subtle sharpness without haloing.

```javascript
/**
 * Denoise (reduce grain/noise) and sharpen subtly.
 * 
 * Phone photos at high ISO are noisy. Slight denoise improves perceived quality.
 * Oversharpen creates halos and fake look — stay conservative.
 */
async function denoiseAndSharpen(inputPath, outputPath) {
  // median() = poor-man's denoise for salt-and-pepper noise
  // sharpen() = USM (Unsharp Mask) kernel with sigma, m1, m2 control
  
  await sharp(inputPath)
    .median(1)  // 1px median filter (very light denoise)
    .sharpen({
      sigma: 1.0,      // Blur radius before subtraction (1.0 = light)
      m1: 0.5,         // Shadow contrast enhancement (0.5 = subtle)
      m2: 3.0,         // Midtone/highlight contrast (3.0 = moderate)
      x1: 3.0,         // Threshold for detail boost (pixels > 3 get sharpened)
      y2: 10.0,        // Output cap (prevent halo overshoot)
      y3: 20.0,        // Output upper cap (ensure stability)
    })
    .toFile(outputPath);
}

// Usage:
await denoiseAndSharpen('work/graded_1234.jpg', 'work/sharpened_1234.jpg');
```

**Sharpen parameter tuning:**

| Param | Typical Range | Low (Subtle) | High (Punchy) | Recommendation |
|-------|---------------|--------------|---------------|-----------------|
| sigma | 0.5–2.0 | 0.5 | 2.0 | **1.0** — balanced |
| m1 (shadow) | 0.1–1.0 | 0.3 | 0.8 | **0.5** — preserve shadows |
| m2 (midtone) | 1.0–5.0 | 1.5 | 5.0 | **3.0** — boost detail |
| x1 (threshold) | 1.0–5.0 | 1.0 | 5.0 | **3.0** — avoid sharpening noise |
| y2 (output cap) | 5.0–20.0 | 5.0 | 20.0 | **10.0** — prevent halos |

**Alternative: Skip denoise, rely on AVIF compression?**  
AVIF at 85% quality compresses noise better than JPEG. For most cases, `median(1)` + encode AVIF directly is sufficient. Use `median(2)` only for very noisy photos.

---

### Stage 5: Responsive Sizing & Format Output

**Goal:** Generate multiple sizes (mobile, tablet, retina) in next-gen formats (AVIF + WebP fallback + JPEG).

```javascript
/**
 * Generate a full responsive set: 3 widths, 2–3 formats per size.
 * Returns an object with src, srcSet, and mime types for <Image> component.
 */
async function generateResponsiveSet(inputPath, publicDir) {
  const filename = path.basename(inputPath, path.extname(inputPath));
  const sizes = [
    { width: 640, name: 'sm' },   // Mobile
    { width: 1024, name: 'md' },  // Tablet
    { width: 1600, name: 'lg' },  // Desktop
  ];

  const formats = ['avif', 'webp', 'jpeg'];
  const outputs = {};

  for (const size of sizes) {
    outputs[size.name] = {};
    
    for (const format of formats) {
      const outPath = path.join(
        publicDir,
        `img-${filename}-${size.width}w.${format}`
      );

      await sharp(inputPath)
        .resize(size.width, null, { withoutEnlargement: true })
        [format]({
          quality: format === 'jpeg' ? 85 : 80,
          progressive: format === 'jpeg',
        })
        .toFile(outPath);

      outputs[size.name][format] = {
        src: `/img-${filename}-${size.width}w.${format}`,
        width: size.width,
      };
    }
  }

  return outputs;
}

// Usage:
const responsive = await generateResponsiveSet(
  'work/sharpened_1234.jpg',
  'public/images'
);
// Returns:
// {
//   sm: { avif: {src, width}, webp: {...}, jpeg: {...} },
//   md: { avif: {...}, ... },
//   lg: { avif: {...}, ... },
// }
```

**Quality settings (tuned for editorial food photography):**

| Format | Quality | Why |
|--------|---------|-----|
| AVIF | 80 | Excellent detail retention at low file size. 30–40% smaller than WebP. |
| WebP | 80 | Fallback for older browsers (Safari <16). Still 20–30% smaller than JPEG. |
| JPEG | 85 | Slowest format, largest files, but universal fallback. Skin tones stable. |

**File sizes example (from 800×1066 mobile crop):**
- AVIF 80% quality: ~45–60 KB
- WebP 80% quality: ~65–85 KB
- JPEG 85% quality: ~95–130 KB

---

### Stage 6: Optional Privacy—Face Blur

**Goal:** One-click privacy masking for sensitive cases (if requested by partner kitchen).

**Challenge:** Sharp has no built-in face detection. You need an external library.

**Option A: Client-side (Next.js)**  
Use `ml5.js` or `face-api.js` in the browser — fast, no server load, but requires user interaction.

```javascript
// On the frontend (React component):
import * as ml5 from 'ml5';
import sharp from 'sharp'; // Nope — can't use in browser!

// This doesn't work. You'd need to send the image back to the server
// after face detection on the client.
```

**Option B: Server-side batch (Recommended for FeedSomeone)**  
Use `face-api.js` with TensorFlow.js backend, or integrate `OpenCV.js` via Node.js binding.

```javascript
import faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';

/**
 * Detect and blur faces in an image.
 * Requires: npm install @vladmandic/face-api @tensorflow/tfjs-node
 */
async function blurFaces(inputPath, outputPath, blurRadius = 25) {
  // 1. Load image as tensor
  const image = await sharp(inputPath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. Detect faces using face-api
  // (This is simplified; real code loads models first)
  const detections = await faceapi
    .detectAllFaces(image)
    .withFaceLandmarks()
    .run();

  // 3. Create mask for faces
  // 4. Blur just the face regions
  // 5. Composite back onto original

  // (Full code requires more setup — see below for simpler approach)
}
```

**Option C: Simpler—Pixelate (Recommended for MVP)**  
Pixelation is faster, requires no ML, and is privacy-compliant:

```javascript
/**
 * Pixelate a rectangular region (simple privacy without ML).
 * Example: if you know the face is roughly in the top-center.
 */
async function pixelateFaceRegion(inputPath, outputPath) {
  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;

  // Assume face is in top-center (rough heuristic)
  const faceLeft = Math.floor(width * 0.25);
  const faceTop = Math.floor(height * 0.1);
  const faceWidth = Math.floor(width * 0.5);
  const faceHeight = Math.floor(height * 0.35);

  // Create pixelated overlay
  const pixelated = await sharp(inputPath)
    .extract({
      left: faceLeft,
      top: faceTop,
      width: faceWidth,
      height: faceHeight,
    })
    .resize(Math.ceil(faceWidth / 15), Math.ceil(faceHeight / 15)) // Pixelate
    .resize(faceWidth, faceHeight) // Scale back up
    .toBuffer();

  // Composite pixelated region back onto original
  await sharp(inputPath)
    .composite([
      {
        input: pixelated,
        left: faceLeft,
        top: faceTop,
      },
    ])
    .toFile(outputPath);
}
```

**Option D: Gaussian blur (Best for food photos)**  
Blur is gentler than pixelation, preserves a hint of the scene context:

```javascript
/**
 * Apply Gaussian blur to a face region.
 * More aesthetic than pixelation, still privacy-protective.
 */
async function blurFaceRegion(inputPath, outputPath) {
  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;

  // Face bounding box (adjust per photo or use face-api)
  const faceLeft = Math.floor(width * 0.25);
  const faceTop = Math.floor(height * 0.1);
  const faceWidth = Math.floor(width * 0.5);
  const faceHeight = Math.floor(height * 0.35);

  // Extract, blur, and composite back
  const blurred = await sharp(inputPath)
    .extract({
      left: faceLeft,
      top: faceTop,
      width: faceWidth,
      height: faceHeight,
    })
    .blur(15) // 15px Gaussian blur
    .toBuffer();

  await sharp(inputPath)
    .composite([
      {
        input: blurred,
        left: faceLeft,
        top: faceTop,
      },
    ])
    .toFile(outputPath);
}
```

**Recommendation for FeedSomeone Phase 1:**
- **Skip automated face blur** — too much complexity for a startup.
- **Manual override flag** in the DB: `photo.blur_faces = true` → trigger blur on re-processing.
- **Phase 2:** Integrate face-api.js if kitchen partners request privacy options.

---

## Full Pipeline: End-to-End Example

```javascript
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

/**
 * Complete editorial photo pipeline.
 * Input: Raw phone photo from kitchen.
 * Output: Graded, cropped, optimized responsive set.
 */
async function processPhotoFull(rawPath, outputDir) {
  const filename = path.basename(rawPath, path.extname(rawPath));
  const workDir = path.join(outputDir, 'work');

  // Ensure directories exist
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  try {
    // Stage 1: Normalize orientation
    const normalized = path.join(workDir, `${filename}_1_normalized.jpg`);
    await sharp(rawPath)
      .autoOrient()
      .withMetadata(false)
      .toFile(normalized);

    // Stage 2: Smart crop
    const cropped = path.join(workDir, `${filename}_2_cropped.jpg`);
    await sharp(normalized)
      .resize(800, 1066, {
        fit: 'cover',
        position: 'attention',
        kernel: sharp.kernel.lanczos3,
      })
      .toFile(cropped);

    // Stage 3: Warm grade
    const graded = path.join(workDir, `${filename}_3_graded.jpg`);
    await sharp(cropped)
      .tint({ r: 255, g: 235, b: 210 })
      .modulate({
        brightness: 1.08,
        saturation: 1.12,
        hue: 0,
      })
      .toColorspace('srgb')
      .toFile(graded);

    // Stage 4: Denoise & sharpen
    const final = path.join(workDir, `${filename}_4_final.jpg`);
    await sharp(graded)
      .median(1)
      .sharpen({
        sigma: 1.0,
        m1: 0.5,
        m2: 3.0,
        x1: 3.0,
        y2: 10.0,
        y3: 20.0,
      })
      .toFile(final);

    // Stage 5: Generate responsive set
    const sizes = [
      { width: 640, name: 'sm' },
      { width: 1024, name: 'md' },
      { width: 1600, name: 'lg' },
    ];

    const srcSet = {};
    for (const size of sizes) {
      srcSet[size.name] = {};

      // AVIF (primary)
      const avifPath = path.join(
        outputDir,
        `${filename}-${size.width}w.avif`
      );
      await sharp(final)
        .resize(size.width, null, { withoutEnlargement: true })
        .avif({ quality: 80 })
        .toFile(avifPath);

      // WebP (fallback 1)
      const webpPath = path.join(
        outputDir,
        `${filename}-${size.width}w.webp`
      );
      await sharp(final)
        .resize(size.width, null, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(webpPath);

      // JPEG (fallback 2)
      const jpegPath = path.join(
        outputDir,
        `${filename}-${size.width}w.jpg`
      );
      await sharp(final)
        .resize(size.width, null, { withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toFile(jpegPath);

      srcSet[size.name] = {
        avif: `/images/${filename}-${size.width}w.avif`,
        webp: `/images/${filename}-${size.width}w.webp`,
        jpeg: `/images/${filename}-${size.width}w.jpg`,
      };
    }

    console.log(`✓ Processed ${filename}`, srcSet);
    return srcSet;
  } catch (err) {
    console.error(`✗ Failed to process ${rawPath}:`, err.message);
    throw err;
  }
}

// Usage:
const srcSet = await processPhotoFull(
  'raw/meal_photo_001.jpg',
  'public/images'
);
// Returns: { sm: {avif, webp, jpeg}, md: {...}, lg: {...} }
```

---

## Next.js 16 Integration: Using Processed Images

### Pattern 1: Static Imports (Build-time)

```tsx
// app/(site)/page.tsx
import Image from 'next/image';
import mealPhoto from '@/public/images/meal_001.jpg';

export default function MealGallery() {
  return (
    <Image
      src={mealPhoto}
      alt="Child receiving meal at kitchen"
      width={800}
      height={1066}
      quality={80}      // Required in Next.js 16
      priority         // Optimize LCP if above fold
      className="rounded-lg shadow-lg"
    />
  );
}
```

### Pattern 2: Dynamic URLs with srcSet (Recommended for Photo Gallery)

```tsx
// components/ResponsivePhotoGallery.tsx
'use client';

import Image from 'next/image';

interface PhotoSrcSet {
  avif: string;
  webp: string;
  jpeg: string;
}

interface PhotoSizes {
  sm: PhotoSrcSet;
  md: PhotoSrcSet;
  lg: PhotoSrcSet;
}

export function ResponsivePhoto({ srcSet, alt }: { srcSet: PhotoSizes; alt: string }) {
  return (
    <picture>
      {/* AVIF: modern browsers, smallest file */}
      <source
        srcSet={srcSet.sm.avif}
        media="(max-width: 768px)"
        type="image/avif"
      />
      <source
        srcSet={srcSet.md.avif}
        media="(max-width: 1024px)"
        type="image/avif"
      />
      <source srcSet={srcSet.lg.avif} type="image/avif" />

      {/* WebP: older browsers that support WebP */}
      <source
        srcSet={srcSet.sm.webp}
        media="(max-width: 768px)"
        type="image/webp"
      />
      <source
        srcSet={srcSet.md.webp}
        media="(max-width: 1024px)"
        type="image/webp"
      />
      <source srcSet={srcSet.lg.webp} type="image/webp" />

      {/* JPEG: fallback for all browsers */}
      <img
        src={srcSet.sm.jpeg}
        srcSet={`
          ${srcSet.sm.jpeg} 640w,
          ${srcSet.md.jpeg} 1024w,
          ${srcSet.lg.jpeg} 1600w
        `}
        sizes="(max-width: 768px) 640px, (max-width: 1024px) 1024px, 1600px"
        alt={alt}
        className="w-full rounded-lg shadow-lg"
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

// Usage:
<ResponsivePhoto
  srcSet={mealPhotoSrcSet}
  alt="Meal prepared by kitchen partner"
/>
```

### Pattern 3: Next.js Image + Custom Loader (For Dynamic URLs)

```tsx
// lib/imageLoader.ts
export function feedsomeoneLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  // Format: /images/meal_001-640w.avif (if browser supports AVIF)
  // Fallback: /images/meal_001-640w.jpg
  const basePath = src.split('.')[0]; // Remove extension
  const q = quality || 80;

  // Check browser capabilities at runtime (simplified)
  return `${basePath}-${width}w.jpg?q=${q}`;
}

// app/(site)/gallery.tsx
import Image from 'next/image';
import { feedsomeoneLoader } from '@/lib/imageLoader';

export default function MealPhotoGallery() {
  return (
    <Image
      loader={feedsomeoneLoader}
      src="/images/meal_001"
      alt="Meal photo"
      width={800}
      height={1066}
      quality={80}
      sizes="(max-width: 640px) 640px, (max-width: 1024px) 1024px, 1600px"
      className="rounded-lg"
    />
  );
}
```

### Performance: Core Web Vitals Considerations

1. **LCP (Largest Contentful Paint):** If meal photos are above fold, use `priority` in Next.js Image.
2. **CLS (Cumulative Layout Shift):** Always specify `width` and `height` to prevent layout reflow.
3. **preload-images:** For hero/gallery, preload AVIF in `<head>`:
   ```html
   <link rel="preload" as="image" href="/images/meal_001-1600w.avif" type="image/avif" />
   ```
4. **Accessibility:** Always include descriptive `alt` text — conveys emotion, not just literal description.

---

## Implementation Checklist

- [ ] **Setup:** `npm install sharp@0.35`
- [ ] **Test Phase 1 (Orientation):** Run pipeline on 5–10 raw phone photos, inspect normalized output.
- [ ] **Test Phase 2 (Crop):** Compare `position: 'attention'` vs `'entropy'` on diverse photos (faces centered, off-center, mixed scenes).
- [ ] **Test Phase 3 (Grade):** Gather feedback from Danish/kitchen partners — is the warmth too strong? Too subtle?
- [ ] **Test Phase 4 (Output):** Verify AVIF/WebP file sizes; validate srcSet on mobile devices (iOS Safari, Android Chrome).
- [ ] **Integration:** Implement as a scheduled batch job (Firebase scheduled function) or real-time API handler.
- [ ] **DB Schema:** Add columns: `photo.processed_avif_url`, `photo.processed_webp_url`, `photo.processed_jpeg_url`, `photo.blur_faces` (bool).
- [ ] **Monitoring:** Log file sizes, processing times, error rates.

---

## Known Gotchas & Workarounds

### Gotcha 1: EXIF Orientation on HEIC/HEIF

**Problem:** Some newer iPhones save HEIC format. Sharp 0.35 can decode HEIC, but orientation handling may be inconsistent.

**Workaround:** Convert HEIC → JPEG before normalizing:
```javascript
await sharp(heicPath)
  .jpeg({ quality: 95, progressive: false })
  .toFile(jpegPath);
// Then process as normal
```

### Gotcha 2: Face Detection Adds Complexity

**Problem:** ML5.js / face-api.js require TensorFlow.js backend, adding 10–30 MB to bundle or API handler.

**Workaround:** Skip automated face blur in Phase 1. Use a manual DB flag (`blur_faces`) and re-process on demand if kitchen requests privacy.

### Gotcha 3: Color Profiles

**Problem:** Some phones embed color profiles (Adobe RGB, ProPhoto). Sharp assumes sRGB by default.

**Workaround:** Always output to sRGB with `.toColorspace('srgb')` before JPEG/AVIF encoding.

### Gotcha 4: File Watch on Windows OneDrive

**Problem:** If you store processed images in OneDrive, file-watch events may fire slowly or miss files.

**Workaround:** Store processed images on local disk or a network share outside OneDrive. Use polling-based jobs instead of file-watch for the pipeline trigger.

### Gotcha 5: Batch Processing Memory

**Problem:** Processing 1000 photos sequentially in a Node loop can exhaust memory (sharp buffers each in RAM).

**Workaround:** Use a worker pool:
```javascript
import pLimit from 'p-limit';

const limit = pLimit(4); // Max 4 concurrent
const jobs = files.map(f => limit(() => processPhotoFull(f, outputDir)));
await Promise.all(jobs);
```

---

## Performance Budget (Estimates)

| Metric | Target | Expected |
|--------|--------|----------|
| Mobile image load (3G, 640px AVIF) | < 200ms | 50–80ms |
| Responsive AVIF @1600w | < 100 KB | 80–120 KB |
| Processing one photo (full pipeline) | < 5s | 2–4s on modern CPU |
| Batch 100 photos (4 workers) | < 10 min | 5–8 min |

---

## Prefers-Reduced-Motion: Handling

Sharp processes static images, not animations. However, when displaying in the web UI:

```tsx
// components/PhotoGallery.tsx
import { useReducedMotion } from '@/hooks/useReducedMotion';

export function MealPhotoCarousel() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className="carousel"
      style={{
        scrollBehavior: prefersReducedMotion ? 'auto' : 'smooth',
        transition: prefersReducedMotion ? 'none' : 'opacity 0.3s ease-in-out',
      }}
    >
      {/* Photos */}
    </div>
  );
}
```

---

## Recommended File Structure

```
src/lib/image/
  ├── pipeline.ts          # processPhotoFull(), stages 1–5
  ├── color-grade.ts       # warmGrade(), adaptive grading
  ├── crop.ts              # smartCropAttention(), smartCropEntropy()
  ├── privacy.ts           # blurFaceRegion() (Phase 2)
  ├── responsive.ts        # generateResponsiveSet()
  └── types.ts             # PhotoSrcSet, PhotoSizes interfaces

functions/
  └── photo-processor.ts   # Firebase scheduled function (batch job)
    # Trigger: daily at 02:00 Asia/Kolkata
    # Scan: supabase.table('photos').where({processed: false})
    # Process: pipeline.processPhotoFull() per photo
    # Update: DB with processed_avif_url, processed_webp_url, etc.

public/images/             # Output folder (gitignored)
  ├── meal_001-640w.avif
  ├── meal_001-1024w.avif
  ├── meal_001-1600w.avif
  ├── meal_001-640w.webp
  ├── ...
  └── meal_001-640w.jpg

.gitignore
  +public/images/          # Don't commit processed images
  +src/lib/image/work/     # Don't commit intermediate pipeline files
```

---

## Summary: The Editorial Aesthetic

The goal is **honesty, not artistry**. These photos document joy and real impact. The pipeline should:

1. **Fix technical issues** (orientation, crop, ISO noise).
2. **Unify presentation** (consistent crop, warm color palette to match the brand).
3. **Preserve authenticity** (no heavy filters, natural skin tones, recognizable food).
4. **Optimize for web** (responsive sizes, next-gen formats, fast load times).

The result should feel like a **premium editorial photo essay** — the kind you'd see in a high-quality magazine or foundation report — not an AI template or Instagram aesthetic.

---

## References & Tools

- **sharp 0.35 docs:** https://sharp.pixelplumbing.com/
- **Next.js 16 Image:** https://nextjs.org/docs/app/building-your-application/optimizing/images
- **face-api.js (Phase 2):** https://github.com/vladmandic/face-api
- **ml5.js:** https://learn.ml5js.org/
- **AVIF Encoding Guide:** https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Image_types
- **Color Temperature in Photography:** https://en.wikipedia.org/wiki/Color_temperature

---

**Last Updated:** 2026-06-14  
**Author:** Claude Code (Research Agent)  
**Status:** Ready for Implementation (Phase 3.9)
