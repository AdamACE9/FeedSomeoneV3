# FeedSomeone — Execution Log (Phase 3)

> Append-only. Every stage: what was built, decisions made, deviations from plan, verification result.

## 2026-06-12 — Execution authorized
- Adam approved full pipeline run ("Yes — run all phases now").
- Token policy active: Fable = core (schema, money/time, payments/webhook/cron, landing); sonnet = surfaces (kitchen, admin, portal, emails, scripts, tests); haiku = lookups.
- Docker Desktop auto-started for local Supabase.
- Verification V-1/V-2/V-4 dispatched (haiku, background): Next.js major + Tailwind v4 setup, supabase CLI local workflow, sharp + bit_count facts.

## Stages 3.0–3.4 (same day)
- **V-1/2/4 results:** Next 16.2.9 + React 19.2 (async request APIs; middleware→proxy; Turbopack default), Tailwind v4 CSS-first, supabase CLI `status -o env`/`db reset` confirmed, PG15 local (bit_count ✓), sharp 0.35 prebuilt ✓.
- **3.0 scaffold (sonnet agent):** hand-rolled (create-next-app refuses non-empty dirs). Installed: next 16.2.9, react 19.2.7, tailwind 4.3.0, sharp 0.35.1, stripe 22.2.0, resend 6.12.4, supabase-js 2.108.1, ssr 0.12.0, date-fns-tz 3.2.0 (`@date-fns/tz` doesn't exist). Typecheck clean.
- **3.1 (Fable):** migrations 0001 (schema + assign_photos SKIP LOCKED + allocate_receipt + get_public_stats + buckets), 0002 (RLS deny-by-default + app_role()/app_kitchen_id() security-definer helpers + public_kitchens view + storage policies), 0003 (find_similar_photo bit_count Hamming), seed.sql (auth users via bcrypt insert incl. empty-string token columns; demo kitchen; 8-photo pool + 4-photo delivered chain). **NOT yet applied — Docker Desktop's Windows service is stopped and needs Adam's elevated click; com.docker.service Start-Service = access denied.**
- **3.2 (Fable):** money (canonical amount_inr = qty×2500; local rounds UP; min qty INR1/USD2/AED2), clock (TEST_MODE override via app_settings), timewindow (pure-Intl DST-safe two-pass; no tz dep), payments (normalized PaymentEvent; mock = HMAC-signed HTTP webhooks, deterministic ids ⇒ idempotent replays; stripe = checkout sessions w/ inline price_data, meals+tip separate line items; v22 Invoice.parent.subscription_details fix), email (single funnel → email_outbox always; local|resend), assignment (day batching, eligibility = paid IST date + k−1, schedule = earliest-photo wall-clock → donor tz nextOccurrence), deliver (signed URLs 7d, attempt caps), streaks, receipts, geo (headers→tz-hint→fallback; NO external geo API).
- **3.3 (Fable):** /api/checkout (zod, guest-donor upsert, QR attribution, sub shells), unified /api/webhooks/payment (dedupe row deleted on handler failure so provider retries), cron tick/daily, counter + SSE stream, health, test clock, /mock-checkout (succeed/fail page), dev-cron.mjs.
- **3.4 (Fable):** landing per locked §❷.5 (LiveCounter SSE+fallback, scroll-drawn HowItWorks, threshold-aware StatsBand, team, empty-pool states), /donate full checkout UI, /thanks + StatusPanel anticipation poller, /kitchens trust page, seed-images.mjs.
- **3.5 (sonnet agent):** kitchen portal complete (login, guarded upload, offline localStorage queue, dHash upload route w/ dup flagging). Typecheck clean.
- **3.8-partial (Fable):** functions/ (onSchedule every-minute tick + daily, asia-south1, APP_CRON_SECRET), firebase.json, .firebaserc, apphosting.yaml (secrets via Secret Manager refs).
- **Deviation noted:** brief's "SSE or WebSocket" for live counter → implemented SSE (+ polling fallback). React-email package installed but baseline emails ship from lib/email/render.ts (inline-CSS tables — deliberate: bulletproof email-client compat); can be elevated later without contract changes.
