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

## The Docker incident + cloud pivot (same day, evening)
- Docker Desktop on Adam's machine is wedged: exe launches → pings backend pipes → exits silently; com.docker.service stopped, Start-Service denied (elevation), elevated launch ALSO silent-exits, zero event-log entries, WSL 2.6.3 healthy but zero distros, **PendingFileRenameOperations=True** → a half-finished update is the prime suspect. Fix = reboot (deferred by founder choice).
- **Pivot:** Adam created cloud project `htcmvczrrabikzvaatfo` + supplied new-format API keys (sb_publishable_/sb_secret_). Supabase MCP server added to .mcp.json but tools not available mid-session → wrote `scripts/apply-sql.mjs` (pg client, `_sql_applied` ledger, per-file transactions) instead.
- DB password recovered from founder's 4 candidates via single-host targeted probe (direct IPv6 host reachable on this network — no pooler needed). Probe scripts deleted after success (contained password material). `SUPABASE_DB_URL` lives only in gitignored .env.local.
- **Cloud-compat fix:** 0002 storage.objects policies wrapped in DO/EXCEPTION (insufficient_privilege ⇒ NOTICE skip) — hosted postgres role can't own storage policies; all storage I/O is service-role anyway (uploads via API route, reads via signed URLs), so client policies are defense-in-depth.
- Applied 0001+0002+0003+seed to cloud: **4/4 ok first pass** (incl. auth.users bcrypt seed). seed-images: 12/12 uploaded. `/api/health`: all green. Landing SSR: hero caption "Fed by …" served from the seeded delivered chain.
- supabase/agent-skills installed at Adam's request. `pg` added as devDependency (cloud SQL application).

## Phase 4 — full E2E suite to green (2026-06-12/13, against cloud)
- Stages 3.5/3.6/3.7/3.8 finished (admin 32 files, donor portal + PDF, emails/blur/qr, bash bootstrap + README). **Production build passes — 35+ routes.**
- Playwright suite (19 specs / 20 entries) driven to **20/20 green** over several iterations. Failures were diagnosed from `error-context.md` a11y snapshots + targeted DB/sharp/auth probe scripts (deleted after use), never blind retries.
- **Three real bugs the suite caught** (kept, they harden production):
  1. `adminChangePasswordAction` cleared `must_change_password` via `getUser()` *after* the password rotation → null on cloud → flag never cleared yet returned ok → admin trapped on the change-password page. Fixed: capture identity before rotation + service-role fallback by email.
  2. **Clock override un-clearable:** `app_settings.value` is `jsonb NOT NULL`; `upsert({value:null})` silently violated it, so a time-travel test's future date (2030) leaked into every later request — donation `paid_at` poisoned (counter read 0), anniversary worker window shifted to 2029. Fixed: DELETE the row to clear (`clock.ts` + `resetAppState`).
  3. Upload `dup_of` never set — route read `dupRows[0].id` but `find_similar_photo` aliases `photo_id`. Fixed.
- **Test-harness fixes:** Chromium pin (config defaulted to WebKit, uninstalled); `networkidle`→`domcontentloaded` ONLY on `goto("/")` (the LiveCounter SSE never lets the landing page go idle) — kept `networkidle` everywhere else so React hydration still completes (a blanket swap caused controlled-input wipes); pay button keyed on the `·…→` shape (the "Feed a classroom" toggle also starts with "Feed"); frequency options are `<button role="radio">` so `getByRole("button")` hung 150s → query as `radio`; machine is Asia/Dubai → form auto-selected AED (min qty 2) blocking every qty-1 spec → pinned `timezoneId: Asia/Kolkata` (NY for the USD spec); the embedded "tiny JPEG" base64 was corrupt → `makeTestJpeg()` builds valid JPEGs via sharp; PostgREST embedded-order (`deliveriesFor`) → sort in JS; pool-sensitive specs (04, 19-A) pin the pool deterministically; admin spec rewritten race-free (the old predicate resolved on the transient `/admin` hop).
- `scripts/fix-auth.mjs` added (raw-SQL `auth.users` hashes aren't GoTrue-valid; repairs admin+kitchen logins) and wired into `supabase-init.sh --cloud`.
- **One PowerShell gotcha logged:** `Set-Content -Encoding utf8` (PS 5.1) double-encoded UTF-8 (em-dash/₹/→ → mojibake) when bulk-editing tests; reverted via git and redid edits with a Node script (`fs.writeFileSync utf8`). Lesson: never bulk-edit UTF-8 source with PS 5.1 `Set-Content`.
- Full report → [04-test-report.md](04-test-report.md).

## Phase 5 — cinematic donor-site redesign (2026-06-13)
- Adam: "make the website awesome that I come and say ...WHAT!?" + donating quick/simple. Direction: bold & cinematic, all four levers + more. Built by Fable directly (taste-critical), verified on-screen via chrome-devtools MCP.
- **Design layer** (`globals.css`): filmic grain overlay, `.print` film-frame (paper border + grain + inner vignette + timestamp tab + hover-lift + tilt), warm hero `.stage`, scroll-`reveal`, kinetic keyframes (ken-burns, float, CTA sheen, scroll-cue), `display` type util.
- **Landing**: full-bleed hero with a floating "JUST DELIVERED" print stack (hero photo ken-burns + 2 peeking prints), ticking `LocalClock` ("right now where you are"), film-print carousel, numbered editorial how-it-works (dropped emoji), pull-quote stats band with marigold glow. All locked-spec anchors preserved.
- **QuickDonate** sheet (3-tap fast lane off the hero CTA: amount chips → email → pay, +25% tip pre-checked per spec) posting to the same `/api/checkout`. `HeroCTA` stays a real `<a href="/donate">` (no-JS + E2E) that opens the sheet. `LocalPrice` resolves hero price to the visitor's currency (tz hint) so hero == sheet.
- **Seed images** regenerated: warm grain-textured atmospheric light-fields (no more "SAMPLE PLATE №12" clock gradients) — re-uploaded to cloud Storage.
- **/donate**, **/thanks**, **/portal** brought into the same world (stage/grain, bigger type, print gallery, anticipation beat) — every tested selector/anchor untouched.
- Verified end-to-end in-browser: donate → mock-pay → paid → receipt FS-20260613-0008 → cinematic /thanks. **Full E2E suite re-run: 20/20 green.** One Next warning fixed (`data-scroll-behavior="smooth"` on `<html>`).
- New currency nuance confirmed: on localhost (no geo header) the server falls back to USD, but the client refines to the browser-tz currency — for Adam (Asia/Dubai) the whole donor flow shows **AED** consistently.
