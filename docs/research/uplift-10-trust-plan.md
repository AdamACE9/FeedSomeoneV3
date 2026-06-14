# Uplift 10: Verification & Trust Plan

**Date:** 2026-06-14
**Scope:** Synthesise geo-fencing (uplift-5) + face-tech (uplift-4) + proof-UX (uplift-8) findings
into a concrete build checklist + the on-site "How we keep it honest" section spec.
**Status:** Ready for implementation — build steps ordered by priority.

---

## Executive Summary

FeedSomeone's trust model is already stronger than most charities because the product *is*
verification: the timestamp on every photo is the receipt. The task is to name that clearly on the
site, complete the technical verification infrastructure that is 70 % built, and present it in a
way that feels documentary and earned rather than defensive or corporate.

**Three verification pillars are already partially implemented:**
1. Timestamped photos with EXIF wall-clock data (done — `taken_at` + `tz` columns, `fmtTime()` rendering)
2. Numbered sequential receipts (done — `allocate_receipt()` SQL fn)
3. Face privacy blur (spec complete in uplift-4; not yet wired into upload flow)

**Two pillars need to be built:**
4. Kitchen GPS geo-fence check at upload (spec complete in uplift-5; not yet wired)
5. The on-site "How we keep it honest" section (new — specified in this document)

---

## Part 1: What to Build Now vs. Later

### BUILD NOW (v1 scope — these close the verification loop)

#### 1A. Kitchen GPS Geo-Fence at Upload

**Why now:** Without this, a kitchen could upload a photo taken anywhere. With it, every photo
carries an implicit location certificate the platform can audit. It is not user-visible in v1
(donors do not see the distance check) but it is the backend fact that makes "geo-fenced kitchens"
a true statement on the site.

**What to build:**

```sql
-- supabase/migrations/0002_kitchen_geo.sql
ALTER TABLE kitchens
  ADD COLUMN lat  NUMERIC(10,8),
  ADD COLUMN lng  NUMERIC(11,8),
  ADD COLUMN fence_radius_meters INTEGER NOT NULL DEFAULT 200;

ALTER TABLE photos
  ADD COLUMN exif_gps_lat          NUMERIC(10,8),
  ADD COLUMN exif_gps_lng          NUMERIC(11,8),
  ADD COLUMN geo_verification_source TEXT
    CHECK (geo_verification_source IN ('exif','browser','none')),
  ADD COLUMN geo_verification_status TEXT
    CHECK (geo_verification_status IN ('verified','outside_fence','no_location')),
  ADD COLUMN geo_distance_meters   INTEGER;
```

**Server-side upload handler** — add to `src/app/api/kitchen/upload/route.ts` (or the Uploader
component's server action):

```typescript
import exifr from 'exifr';                       // npm install exifr
import { haversineDistance } from '@/lib/geo';   // implement per uplift-5 §3

const exifGps = await exifr.gps(buffer).catch(() => null);
const verifyLat = exifGps?.latitude ?? browserGps?.lat;
const verifyLng = exifGps?.longitude ?? browserGps?.lng;
const verifySource = exifGps ? 'exif' : browserGps ? 'browser' : 'none';

let geoStatus = 'no_location';
let distanceMeters: number | null = null;

if (verifyLat != null && kitchen.lat != null) {
  distanceMeters = haversineDistance(kitchen.lat, kitchen.lng, verifyLat, verifyLng);
  geoStatus = distanceMeters <= (kitchen.fence_radius_meters ?? 200)
    ? 'verified'
    : 'outside_fence';
}
```

**Admin dashboard flag:** Photos with `geo_verification_status = 'outside_fence'` surface in the
existing admin photos view with a warning badge. No automatic blocking in v1 — Danish reviews
manually. `flagged_for_review` boolean already exists on `photos` table; set it automatically
when status is `outside_fence`.

**Kitchen signup:** Add a single "Capture GPS" button to the admin kitchen-creation form. Uses
`navigator.geolocation.getCurrentPosition()` once; stores lat/lng on `kitchens` row. Fallback:
admin inputs address → Nominatim free geocode (no API key needed).

#### 1B. Face Privacy Blur at Upload

**Why now:** Every photo going to a donor must have faces blurred. This is both a child-safety
requirement and a trust signal ("we protect the children in these photos").

**What to build** (per uplift-4 §3):

```bash
npm install @vladmandic/human sharp   # sharp is already installed
```

```typescript
// src/lib/face/blur.ts
import Human from '@vladmandic/human';
import sharp from 'sharp';

const human = new Human({
  face: { enabled: true },
  hand: { enabled: false },
  pose: { enabled: false },
});

export async function blurFacesInPhoto(
  imageBuffer: Buffer,
  blurRadius = 25
): Promise<{ blurred: Buffer; faceCount: number }> {
  const result = await human.detect(imageBuffer).catch(() => null);
  if (!result?.face?.length) {
    return { blurred: imageBuffer, faceCount: 0 };
  }

  let img = sharp(imageBuffer);
  for (const face of result.face) {
    const [x, y, w, h] = face.boundingBox.map(Math.round);
    const faceRegion = await sharp(imageBuffer).extract({ left: x, top: y, width: w, height: h }).blur(blurRadius).toBuffer();
    img = img.composite([{ input: faceRegion, left: x, top: y }]);
  }

  const blurred = await img.toBuffer();
  return { blurred, faceCount: result.face.length };
}
```

Wire into the existing `src/components/kitchen/Uploader.tsx` server action: after saving the raw
file, call `blurFacesInPhoto`, save the blurred variant to `photos/blurred/{id}.jpg`, store path
in existing `blurred_path` column (already on schema per page.tsx line 37).

**DB addition:**

```sql
ALTER TABLE photos
  ADD COLUMN is_blurred   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN face_count   INTEGER;
```

Set `is_blurred = true` and `face_count = N` after blur completes. Photos with `is_blurred = false`
should not be sent in delivery emails — add check in cron tick.

#### 1C. "How we keep it honest" Landing Page Section

Specified in full in Part 2 below. This is a new `<section>` inserted in
`src/app/(site)/page.tsx` between the stats band and the sign-off, replacing the empty space
that currently exists there.

**File to create:** `src/components/landing/TrustSection.tsx`

---

### PRESENT AS METHODOLOGY (no extra code needed — these are already implemented)

These items are fully real and fully built. They need to be *named* on the site, not built.

| Claim | Built-in evidence |
|---|---|
| Every photo is timestamped to the exact minute | `taken_at` + `tz` columns; `fmtTime()` renders wall-clock on every photo |
| Numbered receipts for every donation | `allocate_receipt()` fn; FS-YYYYMMDD-0001 format |
| One photo, one donor, never reused | `photo_assignments.photo_id UNIQUE` constraint |
| 100% of ₹{amount} feeds children — no admin fee | Copy locked in CLAUDE.md rule 3; badge already on checkout |

---

### DEFER TO DAY 2

These are good ideas that do not belong in v1:

- **Cryptographic photo hashing** (SHA-256 of raw file stored at upload, published on `/verify` page) — impressive but zero demand until donors ask for it.
- **Automated embedding-based duplicate photo detection** — manual admin review is the correct first gate (per uplift-4 §2.2 verdict).
- **Reverse geocoding** (lat/lng → "Mumbai, Maharashtra") — city is already stored on `kitchens.city`; no geocoder needed.
- **Anomaly detection dashboard** (flag kitchens with >10% outside-fence rate) — only makes sense after 1,000+ photos.
- **Third-party audit badge** (GiveWell, Charity Navigator) — requires formal application; plan for 12 months post-launch.

---

## Part 2: The On-Site Trust Section

### Placement

Insert after `<StatsBand>` and before the sign-off "Feed someone." section in
`src/app/(site)/page.tsx`. This respects the locked section order (CLAUDE.md rule 1) since the
original spec does not include a trust section — this is a new section added *between* the stats
band and the closing sign-off.

### Section Name

**Internal handle:** `TrustSection`
**On-page label (timestamp style, clay, uppercase, DM Mono):** `HOW WE KEEP IT HONEST`

### The Four Verification Pillars

Each pillar has: a short word mark (Fraunces 900), one sentence of concrete mechanism, and a
datum that the system actually produces.

---

**Pillar 1 — Timestamped proof**

- **Word mark:** `The minute it happened.`
- **Mechanism sentence:** Every meal photo carries its wall-clock timestamp from the kitchen's camera — not the upload time, not our server time. The minute the photo was taken is what you receive.
- **Datum:** Rendered live from the `taken_at` column in the most recent delivered photo.

---

**Pillar 2 — Geo-fenced kitchens**

- **Word mark:** `Taken where it was cooked.`
- **Mechanism sentence:** Every partner kitchen is registered at a GPS coordinate. Each photo's EXIF location is checked against that address at upload. Photos that stray are flagged for manual review before they reach a donor.
- **Note:** Only add this pillar to the UI after geo-fence code is wired (Part 1 §1A). Until then, omit pillar 2 from the rendered section or render it grayed out with "Coming soon."

---

**Pillar 3 — Privacy-protected faces**

- **Word mark:** `Children protected, always.`
- **Mechanism sentence:** Faces in every meal photo are automatically blurred before leaving our servers. The original is never stored in a donor-accessible location. Children's identities stay private.
- **Note:** Only render this pillar after blur is wired (Part 1 §1B).

---

**Pillar 4 — Numbered receipts**

- **Word mark:** `Every donation has a number.`
- **Mechanism sentence:** Every donation generates a sequential receipt (FS-YYYYMMDD-0001 format, allocated atomically from a per-day counter). That number is your permanent record — searchable, printable, yours.
- **Datum:** Show `FS-{today}-XXXX` as a sample receipt number, rendered in DM Mono.

---

### Full Section Copy (exact)

```
HOW WE KEEP IT HONEST

The minute it happened.
Every meal photo carries its wall-clock timestamp from the kitchen's camera —
not the upload time, not our server time. The minute the photo was taken is
what you receive.

Taken where it was cooked.
Every partner kitchen is registered at a GPS coordinate. Each photo's EXIF
location is checked against that address at upload. Photos that stray are
flagged for manual review before they reach a donor.

Children protected, always.
Faces in every meal photo are automatically blurred before leaving our
servers. The original is never stored in a donor-accessible location.
Children's identities stay private.

Every donation has a number.
Every donation generates a sequential receipt (FS-20260614-0001 format).
That number is your permanent record — searchable, printable, yours.

No admin fee.
100% of every ₹25 feeds a child. Platform costs are covered by optional tips,
pre-set at +25%. You choose.
```

---

### Visual Design Spec

**Layout (mobile-first):** Full-width section, paper background (`#FBF7F0`), top/bottom border in
`line` (`#E5D9C6`). Vertical stack on mobile. On desktop (≥ 1024px): two columns, the section
label + intro copy on the left, the four pillars on the right.

**Grid of pillars:** Single column on mobile. 2×2 on tablet (640px+). Each pillar is a `<article>`
with no card borders — just a rule above (`border-t border-line`), word mark in Fraunces 900
`text-[22px]` ink, mechanism sentence in DM Sans `text-[15px]` ink/70, 8px gap.

**No icons.** The design principle from uplift-7 is typography-led. No shield icons, no checkmarks,
no badges. The mechanism sentence *is* the evidence.

**No animation.** The trust section should feel solid and still. Motion would undermine authority.

**Datum pill (Pillar 1):** If a recent delivered photo exists, show the `taken_at` timestamp in DM
Mono clay, formatted like `12:47 PM · Dharavi` — small, below the mechanism sentence.
Pull from the same `loadRecent()` call that already runs on the landing page (pass `hero.takenAt`
+ `hero.city` as props to `TrustSection`).

**Receipt number (Pillar 4):** Show `FS-{today}-XXXX` in DM Mono, computed server-side:

```typescript
// In Landing page (server component):
const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).replace(/-/g, '');
const sampleReceipt = `FS-${todayIST}-0001`;
// Pass to TrustSection as prop
```

**Tone guard:** No sentences starting with "We are proud to..." or "Our commitment to..." or
"Ensuring..." The voice is declarative. State the mechanism, stop.

---

### Component Skeleton

```tsx
// src/components/landing/TrustSection.tsx
// Server component (no "use client" needed — no interactivity)

type Props = {
  latestTimestamp?: { time: string; city: string };
  sampleReceipt: string;
  geoFenceLive: boolean;  // false until Part 1 §1A is wired
  blurLive: boolean;      // false until Part 1 §1B is wired
};

export default function TrustSection({
  latestTimestamp,
  sampleReceipt,
  geoFenceLive,
  blurLive,
}: Props) {
  const pillars = [
    {
      wordMark: 'The minute it happened.',
      body: `Every meal photo carries its wall-clock timestamp from the kitchen's camera — not the upload time, not our server time. The minute the photo was taken is what you receive.`,
      datum: latestTimestamp
        ? `${latestTimestamp.time} · ${latestTimestamp.city}`
        : null,
      live: true,
    },
    {
      wordMark: 'Taken where it was cooked.',
      body: `Every partner kitchen is registered at a GPS coordinate. Each photo's EXIF location is checked against that address at upload. Photos that stray are flagged for review before they reach a donor.`,
      datum: null,
      live: geoFenceLive,
    },
    {
      wordMark: 'Children protected, always.',
      body: `Faces in every meal photo are automatically blurred before leaving our servers. The original is never stored in a donor-accessible location. Children's identities stay private.`,
      datum: null,
      live: blurLive,
    },
    {
      wordMark: 'Every donation has a number.',
      body: `Every donation generates a sequential receipt. That number is your permanent record — searchable, printable, yours.`,
      datum: sampleReceipt,
      live: true,
    },
  ];

  return (
    <section className="border-y border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[0.6fr_1.4fr] lg:gap-20">
        {/* Left: label + intro */}
        <div>
          <p className="timestamp text-clay">HOW WE KEEP IT HONEST</p>
          <p className="mt-5 text-[17px] leading-relaxed text-ink/65 max-w-xs">
            No admin fee. No generalised impact. Every ₹25 has a receipt, a kitchen, a timestamp,
            and a photo.
          </p>
        </div>

        {/* Right: pillars */}
        <div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
          {pillars.filter((p) => p.live).map((pillar) => (
            <article key={pillar.wordMark} className="border-t border-line pt-6">
              <h3 className="display text-[22px] leading-snug text-ink">
                {pillar.wordMark}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink/70">
                {pillar.body}
              </p>
              {pillar.datum && (
                <p className="timestamp mt-3 text-clay text-[13px]">{pillar.datum}</p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Add to `src/app/(site)/page.tsx`** after `<StatsBand>`:

```tsx
<TrustSection
  latestTimestamp={hero ? { time: fmtTime(hero.takenAt, hero.tz), city: hero.city } : undefined}
  sampleReceipt={`FS-${todayIST}-0001`}
  geoFenceLive={false}   // flip to true after Part 1 §1A ships
  blurLive={false}       // flip to true after Part 1 §1B ships
/>
```

---

## Part 3: Implementation Checklist

### Sprint A — Trust section on the site (1–2 days, no backend changes)

- [ ] Create `src/components/landing/TrustSection.tsx` per skeleton above
- [ ] Compute `todayIST` + `sampleReceipt` in `Landing` server component
- [ ] Insert `<TrustSection>` after `<StatsBand>` in `src/app/(site)/page.tsx`
- [ ] Render with `geoFenceLive={false}` and `blurLive={false}` (shows 2 live pillars + 2 deferred)
- [ ] Mobile test: pillars stack; touch targets not needed (text only)
- [ ] E2E: snapshot the section heading "HOW WE KEEP IT HONEST" in at least one Playwright test

### Sprint B — Face blur at upload (3–5 days)

- [ ] `npm install @vladmandic/human`
- [ ] Create `src/lib/face/blur.ts` per skeleton in Part 1 §1B
- [ ] Wire into kitchen upload server action (after raw file save, before Supabase Storage write)
- [ ] Add migration `0002_face_columns.sql`: `is_blurred`, `face_count` on `photos`
- [ ] Guard delivery cron: skip photos where `is_blurred = false AND face_count IS NULL` (not yet processed)
- [ ] Kitchen portal: show blur-progress state ("Securing photo…") while async job runs
- [ ] Set `blurLive={true}` in `TrustSection` props after Sprint B ships
- [ ] Windows build gotcha: `@vladmandic/human` uses TensorFlow WASM; no native bindings — safe on Windows without node-canvas

### Sprint C — Kitchen GPS geo-fence (3–5 days)

- [ ] `npm install exifr`
- [ ] Add migration `0003_kitchen_geo.sql`: `lat`, `lng`, `fence_radius_meters` on `kitchens`; geo columns on `photos`
- [ ] Add `haversineDistance()` to `src/lib/geo.ts` (haversine formula, per uplift-5 §3)
- [ ] Wire into kitchen upload: extract EXIF GPS, compare to kitchen lat/lng, write `geo_verification_status`
- [ ] Admin kitchen form: add "Capture GPS" button (one-time `getCurrentPosition` call)
- [ ] Admin photos view: badge on `outside_fence` photos; set `flagged_for_review = true` automatically
- [ ] Set `geoFenceLive={true}` in `TrustSection` props after Sprint C ships
- [ ] E2E: upload a photo, verify `geo_verification_status` is set in DB

---

## Part 4: What Competitors Do — and Where FeedSomeone Already Wins

| Platform | Verification model | FeedSomeone comparison |
|---|---|---|
| charity: water | GPS-mapped project sites, third-party audits, 100% model | Project-level proof, one-time emotional hit. No per-donation photo. |
| GiveDirectly | ML anomaly detection, firewalled audit team, annual fraud report | Cash transfer — no photo proof. System-level trust, not moment-level. |
| Watsi | Post-treatment outcome photo | Outcome-based (weeks later). FeedSomeone: same-day, to-the-minute. |
| ShareTheMeal | Aggregate WFP stats | No per-donation photo. Pool-level impact. |
| **FeedSomeone** | **Per-donation photo + EXIF timestamp + receipt number + kitchen GPS + face blur** | **Tightest feedback loop in the sector. Proof is the product.** |

The differentiation is not "we are more transparent than charity: water." It is: "we are the only
platform where your ₹25 has a photo, a minute, a kitchen address, and a sequential receipt — all
tied to your single donation, delivered the same day."

---

## Part 5: Gotchas

- **Do not show `geo_distance_meters` or `exif_gps_lat` to donors.** These are admin audit data. Donors see "Taken where it was cooked." — the claim, not the numbers. Numbers can be screenshot and misread.
- **`@vladmandic/human` cold-start.** First request after server restart: 100–200ms model load. Subsequent requests: cached. On Firebase App Hosting (serverless), warm instances handle this. Do not block the HTTP response on blur completion — enqueue as a background task or use Next.js `after()` (React 19 API) if available in Next 16.
- **EXIF stripping.** WhatsApp, Telegram, and some Android camera apps strip EXIF before saving. ~40% of photos may arrive with no GPS. `geo_verification_status = 'no_location'` is a normal state, not fraud. Do not alarm kitchen staff unless the kitchen has a pattern of 0% EXIF GPS across many uploads.
- **Blur false negatives.** Human.js misses faces at extreme angles or partial occlusion. Add a `face_count = 0` AND `is_blurred = true` state honestly: "Checked — no faces detected." Admin can manually flag if a photo looks wrong.
- **Trust section wording is locked.** Do not change "We charge no admin fee — 100% of ₹{amount} feeds children." (CLAUDE.md rule 3). The trust section's "No admin fee" line echoes this exactly.
- **No "keep the lights on" language anywhere.** The tip framing is "optional support" or simply unlabeled. Trust section copy must not introduce this phrase.
- **Receipt number format.** `FS-YYYYMMDD-0001` uses Asia/Kolkata date. The `sampleReceipt` prop on `TrustSection` must compute `todayIST` server-side using `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` — never the server's UTC date.

---

## Sources

- [GiveDirectly fraud prevention page](https://www.givedirectly.org/risks/)
- [charity: water our-approach](https://www.charitywater.org/our-approach)
- [Best nonprofit websites 2026 — Kanopi](https://kanopi.com/blog/best-nonprofit-websites/)
- [Happiness Acts — photo proof NGO model](https://happinessacts.org/)
- [exifr GitHub](https://github.com/MikeKovarik/exifr)
- [@vladmandic/human npm](https://www.npmjs.com/package/@vladmandic/human)
- [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- Prior briefs: uplift-4-face-tech.md, uplift-5-geo-fence.md, uplift-8-proof-ux.md
