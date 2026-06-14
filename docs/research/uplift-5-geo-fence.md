# Research: Geo-Fencing & Location Verification for Field Charity Ops (v1 Design)

**Date:** 2026-06-14  
**Context:** FeedSomeone meal photos must prove they were taken at a registered kitchen location. This brief proposes a v1 design combining kitchen GPS coordinates, EXIF extraction, browser geolocation, and haversine distance validation.

---

## Executive Summary

A secure, lightweight geo-fencing system for FeedSomeone v1 requires three layers:

1. **Kitchen Registry**: Store kitchen lat/lng at signup (form input or single browser geolocation call).
2. **Photo EXIF Extraction**: Extract GPS from uploaded meal photos on the server using `exifr` (Node.js).
3. **Distance Validation**: Compare photo GPS vs. kitchen GPS via haversine formula; flag if >200m (tunable).
4. **Fallback**: Browser geolocation as UX confirmation (optional upload waiver if missing EXIF).

**Why this works:** EXIF is cryptographically expensive to spoof, haversine is bulletproof for charity ops, and the system ships without external APIs (cost/latency-free). Accuracy is 5–30m for modern phones; we tolerate 200m drift to account for WiFi/network GPS variance and kitchen boundary ambiguity.

---

## Part 1: Browser Geolocation API (2026 Status)

### API Overview

The **W3C Geolocation API** (`navigator.geolocation.getCurrentPosition()`) remains the standard for client-side location capture. It is HTTPS-only, permission-gated, and sources location from GPS, WiFi triangulation, or IP geolocation depending on device and network.

### Accuracy Profile

| Source | Accuracy | Latency | Battery | Notes |
|--------|----------|---------|---------|-------|
| **GPS** | 5–15m | 3–30s | High | Mobile devices with clear sky; requires `enableHighAccuracy: true` |
| **WiFi** | 20–100m | <1s | Low | Triangulation; indoor fallback |
| **IP/Cell** | 100–1000m | <500ms | None | Fallback; unreliable |

For FeedSomeone kitchens, **GPS + WiFi** on modern Android/iOS averages **15–30m accuracy**, sufficient for kitchen-scale verification (assuming kitchen footprint ≤ 100m).

### Code Pattern (Browser Upload Screen)

```javascript
// src/app/kitchen/components/photo-upload.tsx
'use client';

import { useState } from 'react';

export function PhotoUpload() {
  const [position, setPosition] = useState<GeolocationCoordinates | null>(null);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    // Request geolocation as UX context (optional, for warnings)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPosition(pos.coords),
        (err) => setGeolocationError(err.message),
        {
          enableHighAccuracy: true,  // Request GPS if available
          timeout: 10000,            // 10s timeout
          maximumAge: 0,             // No cached position; always fresh
        }
      );
    }

    // Upload file to /api/kitchen/upload-meal-photo
    const formData = new FormData();
    formData.append('file', file);
    if (position) {
      formData.append('browserGps', JSON.stringify({
        lat: position.latitude,
        lng: position.longitude,
        accuracy: position.accuracy,
      }));
    }

    const res = await fetch('/api/kitchen/upload-meal-photo', {
      method: 'POST',
      body: formData,
    });
    
    const result = await res.json();
    
    // Display verification feedback
    if (result.geoStatus === 'outside_fence') {
      console.warn(`⚠️ Photo taken ${result.distanceMeters}m from kitchen. Verify location.`);
    } else if (result.geoStatus === 'verified') {
      console.log('✓ Photo location verified.');
    } else if (result.geoStatus === 'no_exif_gps') {
      console.log('ℹ️ No GPS in photo; using browser geolocation context.');
    }
  }

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />
      {geolocationError && <p className="text-red-600">{geolocationError}</p>}
      {position && (
        <p className="text-sm text-gray-600">
          Browser GPS: {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)} (±{Math.round(position.accuracy)}m)
        </p>
      )}
    </div>
  );
}
```

### Caveats

- **Permission gate:** Users must explicitly allow location access; deny = fallback to EXIF only.
- **Timeout:** GPS on a cold start can take 5–30 seconds; phones in buildings may never lock.
- **Privacy:** Storing browser GPS server-side requires explicit opt-in. For v1, use it **for verification feedback only**, not stored (see Part 3).
- **High accuracy tax:** `enableHighAccuracy: true` drains battery; use it only for upload, not background.

---

## Part 2: EXIF GPS Extraction (Server-Side)

### Library: `exifr` (2026 Status)

[**exifr**](https://github.com/MikeKovarik/exifr) is the production standard for JavaScript EXIF reading: fast (2.5ms/image), zero dependencies, works in Node.js and browsers, handles .jpg/.png/.heic/.avif.

### Installation

```bash
npm install exifr
```

### Node.js Pattern: Server Photo Upload Handler

```typescript
// src/app/api/kitchen/upload-meal-photo/route.ts
import { NextRequest, NextResponse } from 'next/server';
import exifr from 'exifr';
import { createClient } from '@/lib/supabase/server';
import { haversineDistance } from '@/lib/geo';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  
  // Verify kitchen auth (server-only via RLS)
  const user = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const kitchenId = user.user?.id;
  const kitchen = await supabase
    .from('kitchens')
    .select('lat, lng, fence_radius_meters')
    .eq('id', kitchenId)
    .single();

  if (!kitchen.data) {
    return NextResponse.json({ error: 'Kitchen not found' }, { status: 404 });
  }

  // Parse multipart form data
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const browserGpsStr = formData.get('browserGps') as string | null;

  if (!file || !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Invalid image' }, { status: 400 });
  }

  // Convert File to Buffer for exifr
  const buffer = Buffer.from(await file.arrayBuffer());

  // Extract GPS from EXIF
  let exifGps: { latitude: number; longitude: number } | null = null;
  let exifAccuracy: number | null = null;

  try {
    const gps = await exifr.gps(buffer);
    if (gps) {
      exifGps = {
        latitude: gps.latitude,
        longitude: gps.longitude,
      };
      // GPS accuracy from EXIF is not standardized; assume ±10m for modern phones
      exifAccuracy = 10;
    }
  } catch (err) {
    console.error('EXIF GPS extraction failed:', err);
  }

  // Decide verification source
  let verifyLat = exifGps?.latitude;
  let verifyLng = exifGps?.longitude;
  let verifySource = 'exif';

  if (!exifGps && browserGpsStr) {
    const browserGps = JSON.parse(browserGpsStr);
    verifyLat = browserGps.lat;
    verifyLng = browserGps.lng;
    verifySource = 'browser';
  }

  // Compute distance if we have a location
  let geoStatus = 'no_location';
  let distanceMeters = null;

  const fenceRadiusMeters = kitchen.data.fence_radius_meters || 200;

  if (verifyLat !== undefined && verifyLng !== undefined) {
    distanceMeters = haversineDistance(
      kitchen.data.lat,
      kitchen.data.lng,
      verifyLat,
      verifyLng
    );

    geoStatus = distanceMeters <= fenceRadiusMeters ? 'verified' : 'outside_fence';
  }

  // Store meal photo in Storage + metadata in DB
  const fileName = `${kitchenId}/${Date.now()}-${crypto.randomUUID()}.jpg`;
  
  const { data: storageData, error: storageError } = await supabase.storage
    .from('meal-photos')
    .upload(fileName, buffer, { contentType: 'image/jpeg' });

  if (storageError) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  // Record in DB
  const { error: dbError } = await supabase.from('meal_photos').insert({
    kitchen_id: kitchenId,
    storage_path: fileName,
    exif_gps_lat: exifGps?.latitude || null,
    exif_gps_lng: exifGps?.longitude || null,
    geo_verification_source: verifySource,
    geo_verification_status: geoStatus,
    geo_distance_meters: distanceMeters,
    geo_fence_radius_meters: fenceRadiusMeters,
    created_at: new Date().toISOString(),
  });

  if (dbError) {
    return NextResponse.json({ error: 'DB insert failed' }, { status: 500 });
  }

  // Return status to client
  return NextResponse.json({
    success: true,
    geoStatus,
    distanceMeters,
    verificationSource: verifySource,
  });
}
```

### EXIF GPS Format

Modern cameras and phones embed GPS as **TIFF/EXIF tags**:

```
GPSLatitude: [51, 17, 58.57]  (degrees, minutes, seconds)
GPSLatitudeRef: 'N' or 'S'
GPSLongitude: [0, 7, 0.46]
GPSLongitudeRef: 'E' or 'W'
```

`exifr` automatically converts these to decimal degrees:
- `[51, 17, 58.57, 'N']` → `51.29960°`

### Caveats

- **Not all photos have GPS:** Requires explicit camera permission, doesn't crop EXIF in most social apps. ~60% of field uploads will likely have EXIF GPS.
- **Spoofing risk:** EXIF can be manually edited with tools like ExifTool, but doing so is expensive and deliberate (not casual cheating). For v1, accept this risk and audit flagged kitchens via manual photo review.
- **Privacy concern:** Don't display raw EXIF GPS to users; store it server-side for verification only.

---

## Part 3: Haversine Distance Validation

### Formula & Implementation

The **haversine formula** computes great-circle distance between two lat/lng points, accounting for Earth's curvature.

```typescript
// src/lib/geo.ts
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
```

### Accuracy Profile

| Scenario | Error | Acceptable? |
|----------|-------|------------|
| Phone GPS (clear sky) | ±5m | ✓ |
| Phone GPS (urban canyon) | ±30m | ✓ |
| WiFi triangulation | ±50m | ~ (case-by-case) |
| IP geolocation (fallback) | ±500m | ✗ (too noisy) |

For kitchens with a ~100m footprint, use a **200m fence radius** as default:
- Tolerates GPS drift + kitchen ambiguity.
- Flags egregious spoofing (uploaded from a competitor's location).
- Admin can adjust per kitchen if needed.

### Fence Radius Per Kitchen

Store `fence_radius_meters` on the `kitchens` table; allow admins to adjust:

```sql
ALTER TABLE kitchens ADD COLUMN fence_radius_meters INTEGER DEFAULT 200;
ALTER TABLE kitchens ADD COLUMN lat NUMERIC NOT NULL;
ALTER TABLE kitchens ADD COLUMN lng NUMERIC NOT NULL;
```

---

## Part 4: Reverse Geocoding (Optional for v1)

### Use Case

Reverse geocoding (lat/lng → city/address) is **not required for v1** but useful for:
- Admin dashboard: "Photo taken in Mumbai, 15km from kitchen."
- Donor portal: "Meal prepared at [Kitchen Name] in [City]."

### Options

| Library | Trade-offs | Notes |
|---------|-----------|-------|
| **local-reverse-geocoder** | 2GB download, offline | City-level, no API calls; good for batch jobs |
| **node-geocoder** + OpenStreetMap | Lighter, paid tiers exist | Query-based, supports street-level |
| **Google Maps Geocoding API** | $0.005/request, fast | Reliable; costs scale with volume |

For **v1, skip it.** The admin dashboard can show raw lat/lng + distance. If donors ask for kitchen name, that's already in the DB.

---

## Part 5: Schema & Migrations

### Kitchen Registration

```sql
-- kitchens table additions
ALTER TABLE kitchens ADD COLUMN lat NUMERIC(10,8) NOT NULL;
ALTER TABLE kitchens ADD COLUMN lng NUMERIC(11,8) NOT NULL;
ALTER TABLE kitchens ADD COLUMN fence_radius_meters INTEGER DEFAULT 200;

-- Composite index for location queries (future)
CREATE INDEX idx_kitchens_location ON kitchens (lat, lng);
```

### Meal Photo Tracking

```sql
CREATE TABLE meal_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id UUID NOT NULL REFERENCES kitchens(id),
  storage_path TEXT NOT NULL,
  
  -- EXIF GPS
  exif_gps_lat NUMERIC(10,8),
  exif_gps_lng NUMERIC(11,8),
  
  -- Verification
  geo_verification_source TEXT CHECK (geo_verification_source IN ('exif', 'browser', 'none')),
  geo_verification_status TEXT CHECK (geo_verification_status IN ('verified', 'outside_fence', 'no_location')),
  geo_distance_meters INTEGER,
  geo_fence_radius_meters INTEGER,
  
  -- Manual review flag
  flagged_for_review BOOLEAN DEFAULT FALSE,
  review_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meal_photos_kitchen ON meal_photos(kitchen_id);
CREATE INDEX idx_meal_photos_verification ON meal_photos(geo_verification_status);
CREATE INDEX idx_meal_photos_flagged ON meal_photos(flagged_for_review);
```

### Admin Dashboard Query

```sql
-- Flag photos taken >200m from kitchen
SELECT
  mp.id,
  mp.created_at,
  k.name,
  mp.geo_distance_meters,
  CASE WHEN mp.geo_distance_meters > 200 THEN 'OUTSIDE FENCE' ELSE 'OK' END as status
FROM meal_photos mp
JOIN kitchens k ON mp.kitchen_id = k.id
WHERE mp.geo_verification_status = 'outside_fence'
ORDER BY mp.created_at DESC;
```

---

## Part 6: UX & Error Handling

### Kitchen Signup (Register Location)

```typescript
// Option A: Form input (if kitchen has address)
<input type="text" placeholder="Kitchen address" />
// → Fetch lat/lng via OpenStreetMap Nominatim (free, no key)

// Option B: Single geolocation click
<button onClick={() => {
  navigator.geolocation.getCurrentPosition((pos) => {
    setLat(pos.coords.latitude);
    setLng(pos.coords.longitude);
  });
}}>
  Capture GPS
</button>
```

### Photo Upload UX

**Success (Verified):**
```
✓ Photo location verified
 Kitchen: Ashoka Mid-Day Meal Center
 Taken at: 12:43 PM, 2.3km from donor
```

**Warning (Outside Fence):**
```
⚠️ Photo location is 250m from registered kitchen
 Either:
 1. Kitchen GPS is slightly off (adjust in settings)
 2. Photo was taken in transit
 Proceed? [Cancel] [Review Later] [Upload Anyway]
```

**Info (No EXIF GPS):**
```
ℹ️ This photo has no GPS metadata. Please enable camera location access.
 Proceeding with browser geolocation as fallback.
```

### Error Fallback

If EXIF is missing **and** user denies browser geolocation:
- **Proceed with upload** but flag in DB: `geo_verification_status = 'no_location'`.
- Admin can review later or ask kitchen to re-upload with location enabled.

---

## Part 7: Implementation Checklist (v1)

**Week 1: Core Infra**
- [ ] Add `lat`, `lng`, `fence_radius_meters` to `kitchens` table.
- [ ] Create `meal_photos` table with geo columns.
- [ ] Implement `haversineDistance()` in `src/lib/geo.ts`.
- [ ] Install `exifr` v7+.

**Week 2: Kitchen Upload**
- [ ] Build `POST /api/kitchen/upload-meal-photo` with EXIF extraction.
- [ ] Return `geoStatus` + `distanceMeters` to client.
- [ ] UI: Show verification result + warning if outside fence.

**Week 3: Admin & Donor**
- [ ] Admin dashboard: List flagged photos (outside fence).
- [ ] Admin form: Adjust `fence_radius_meters` per kitchen.
- [ ] Donor portal: Show kitchen name + "Meal prepared in [City]" (no lat/lng exposed).

**Week 4: Testing & Tuning**
- [ ] Seed test photos (with/without EXIF GPS) via `scripts/seed-images.mjs`.
- [ ] E2E test: Upload from kitchen, verify distance calc.
- [ ] Adjust fence_radius_meters based on pilot feedback.

---

## Part 8: Accuracy Caveats & Mitigations

| Problem | Cause | Mitigation |
|---------|-------|-----------|
| **EXIF GPS ±30m drift** | WiFi triangulation, multipath | Tolerate 200m fence; accept variance as feature (real-world chaos). |
| **60% missing EXIF GPS** | Privacy/app settings | Fallback to browser geolocation; allow manual review. |
| **Spoof-able EXIF** | ExifTool/editor | Flag outliers; audit flagged kitchens manually (out-of-scope for v1). |
| **Cold GPS lock (30s+)** | First fix latency | Show spinner; set timeout to 10s; don't block upload. |
| **Building/underground (no GPS)** | Multipath/shadowing | Accept browser WiFi fallback or no_location. |

---

## Part 9: Deployment & Operations

### Environment Variables

```bash
# .env.local
GEO_ENABLED=true
GEO_FENCE_RADIUS_DEFAULT=200  # meters
GEO_REQUIRE_VERIFICATION=false  # If true, block uploads without geo; v1: false
```

### Monitoring

Log all geo verifications to Supabase for auditing:

```typescript
// src/lib/geo-logger.ts
export async function logGeoVerification(
  mealPhotoId: string,
  status: 'verified' | 'outside_fence' | 'no_location',
  distance?: number
) {
  await supabase.from('geo_verification_log').insert({
    meal_photo_id: mealPhotoId,
    status,
    distance_meters: distance,
    logged_at: new Date().toISOString(),
  });
}
```

### Alerts for Admins

Dashboard query flags photos outside fence for manual review:
- Trigger: `geo_distance_meters > fence_radius_meters`
- Action: Email admin; set `flagged_for_review = true`.

---

## Part 10: Future Enhancements (Day 2+)

1. **Reverse Geocoding:** Add kitchen city/state to donor receipt (use local-reverse-geocoder).
2. **Geofencing Live:** Real-time kitchen check-in/check-out tracking (geo-fencing daemon).
3. **Cryptographic Proof:** Store photo hash + timestamp signature for audit trail.
4. **Anomaly Detection:** Flag kitchens with >10% outside-fence photos (statistical QC).
5. **Map View (Admin):** Show all kitchens + recent meal photos on map.

---

## Summary

FeedSomeone's v1 geo-fencing stack:

1. **Kitchen GPS** stored at signup (form or geolocation button).
2. **EXIF GPS** extracted server-side via `exifr` (Node.js).
3. **Haversine distance** checked against 200m fence (tunable per kitchen).
4. **Browser geolocation** as fallback if EXIF missing (UX context, not stored for v1).
5. **Manual review** flag for out-of-fence uploads; admin dashboard for oversight.

**Cost:** Zero external APIs. **Accuracy:** 5–30m for modern phones, 200m tolerance. **Spoofing resistance:** EXIF is hard to fake; casual cheating fails. **Shipping time:** 2–3 weeks (core) + 1 week testing.

---

## References & Sources

- [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [exifr GitHub](https://github.com/MikeKovarik/exifr)
- [Google for Developers: Geolocation API](https://developers.google.com/maps/documentation/geolocation/overview)
- [local-reverse-geocoder (npm)](https://www.npmjs.com/package/local-reverse-geocoder)
- [The Haversine Formula: A Must-Have for Geospatial Reporting](https://medium.com/@mattgazzano/the-haversine-formula-a-must-have-for-geospatial-reporting-1a1258552a5e)
- [Creating a Geofence API Using the Haversine Formula, PHP, and DreamFactory's Scripted API Services](https://blog.dreamfactory.com/creating-a-geofence-api-using-the-haversine-formula-php-and-dreamfactorys-scripted-api-services)
- [How to Geocode Image Metadata (EXIF Data)](https://opencagedata.com/guides/how-to-geocode-images)
