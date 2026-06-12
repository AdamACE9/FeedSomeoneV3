# FeedSomeone

Donation platform: **pay ₹25 → a child is fed at a partner kitchen → the donor gets the actual
photo of that meal, emailed at the exact local time it was taken.** Emotional infrastructure,
not transactional. Three surfaces, all mobile-first: donor site `/`, kitchen portal `/kitchen`,
admin `/admin`.

**Read before building anything:** [docs/02-master-plan.md](docs/02-master-plan.md) (full plan:
schema, APIs, jobs, pages, tests) and [docs/00-stack-decisions.md](docs/00-stack-decisions.md)
(founder-locked stack). The original brief lives in the founders' hands; the plan supersedes
nothing in it — only adds.

## Locked stack (founder decisions — do not revisit)

- **Next.js App Router + TypeScript**, Tailwind v4. Fonts: Fraunces 900 (display), DM Sans (body), DM Mono (timestamps/receipts).
- **Supabase** = Postgres + Auth + Storage + Realtime. Local via Docker + supabase CLI today; cloud later via scripts.
- **Firebase App Hosting** = production hosting. **Firebase scheduled functions v2** = production cron (HTTPS → `/api/cron/*` with `CRON_SECRET`). Local cron = `scripts/dev-cron.mjs`.
- **NO Vercel. NO Render.** (Adam's explicit call.)
- **Stripe is MOCKED until Day 2**: `PAYMENT_PROVIDER=mock|stripe` env flip, zero code changes. Mock posts HMAC-signed Stripe-shaped events to the real webhook handler and writes real DB rows.
- **Email**: `EMAIL_PROVIDER=local|resend`. Local mode writes to `email_outbox` table, viewable at `/dev/mailbox`.

## Non-negotiable product rules (from Danish's locked UX spec)

1. Homepage section order is fixed: counter pill → "Feed one child right now." → CTA "Feed one child · ₹25 →" → hero photo above fold ("Fed by {first_name≤10|Someone} in {city}" + timestamp) → 10-photo carousel → scroll-drawn 4-step How-It-Works → dark stats band → team section.
2. **No currency picker anywhere.** IP-detected INR/USD/AED, fallback USD. Fixed FX: 1 USD = 83 INR, 1 AED = 22.6 INR. Store BOTH local and INR smallest-unit integers on every transaction.
3. Tip framing only — never "platform contribution" in UI, **never the phrase "keep the lights on"**. Badge: "We charge no admin fee — 100% of ₹{amount} feeds children." Options No-thanks…+50%, **+25% pre-selected**. Tips live in their own table, never mixed with donations.
4. Scheduled donations: "N children × D days" = **D emails, one per day, each with that day's N photos**, delivered at the earliest photo's wall-clock time that day, shown in donor's timezone. "Day X of D · N meals."
5. Photo engine: FIFO oldest-first by country, `assign_photos()` SQL fn with `FOR UPDATE SKIP LOCKED`. **One photo, one donor, no reuse** (UNIQUE constraint). Empty pool → `waiting` → 5-min retry. Delivery time = photo's local wall-clock re-rendered in donor tz; if already past today → tomorrow.
6. Receipts `FS-YYYYMMDD-0001`, sequential per Asia/Kolkata day, via `allocate_receipt()` (atomic upsert counter).
7. Every photo everywhere carries its timestamp in small DM Mono. Time is the product.
8. Guest checkout only needs an email. Accounts auto-created; donor portal via magic link.
9. Mobile-first on ALL THREE portals (Danish runs ops from his phone). Touch targets ≥ 44px.
10. Stripe minimums: enforce min quantity INR 1 / USD 2 / AED 2 at checkout (R1 in plan §11).

## Conventions

- Money = `bigint` smallest units (paise/cents/fils). Never floats. Helpers in `src/lib/money.ts`.
- Time: store UTC `timestamptz` + IANA tz columns; wall-clock math only via `src/lib/timewindow.ts`; **all** "now" reads go through `src/lib/clock.ts` (honors test clock override).
- DB access: server-only service-role client (`src/lib/supabase/server.ts`); RLS deny-by-default as defense-in-depth; donors/kitchens read own rows only.
- Providers are interfaces first (`src/lib/payments/`, `src/lib/email/`); env var picks implementation; both implementations write identical DB records.
- Idempotency: webhooks via `webhook_events (provider, event_id)` unique; deliveries via status guards + attempt counts.
- Copy voice: documentary, human, short sentences. No nonprofit clichés, no corporate speak, no progress bars, no fake gamification.
- Palette: ink `#211511` paper `#FFFDF9` clay `#C4471D` clay-deep `#A33713` marigold `#E8A33D` leaf `#3E6B3A` sand `#F3EBDD` line `#E5D9C6` (CSS custom props in `globals.css`).

## Repo map (target layout — see plan §3 for full tree)

```
src/app/(site)/   donor pages        src/lib/payments/  PaymentProvider mock|stripe
src/app/kitchen/  kitchen portal     src/lib/email/     EmailProvider local|resend
src/app/admin/    admin portal       src/emails/        react-email templates
src/app/api/      webhooks+cron+co   supabase/          migrations + seed.sql
functions/        Firebase cron fns  scripts/           bash bootstrap + dev-cron.mjs
```

## Commands (⚠ exist only after stage 3.0/3.1 — check Build status below first)

```bash
npm run setup        # bash scripts/bootstrap.sh — full local bootstrap (Docker must be running)
npx supabase start   # local Supabase stack
npx supabase db reset  # re-apply migrations + seed.sql
npm run dev          # Next.js dev server
node scripts/dev-cron.mjs  # local 60s cron loop → /api/cron/tick
npm run test:e2e     # Playwright suite (starts webServer itself)
```

Seeded logins: admin `admin@feedsomeone.com`/`Admin@123` (forced pw change), kitchen `kitchen@feedsomeone.com`/`Kitchen@123`.

## Gotchas (Windows dev machine)

- Shell is PowerShell; `.sh` scripts run via **Git Bash** (`bash scripts/foo.sh`). Don't use `&&` in PowerShell 5.1.
- supabase CLI is **not** globally installed — always `npx supabase …`. Docker Desktop must be RUNNING first (it often isn't — start it and wait for the engine).
- Repo lives inside OneDrive: if file-watch/HMR misbehaves, that's why (plan §11 R9).
- Subagents: this user hits session token limits — keep agent fleets small, prefer haiku/sonnet (see Agent/token policy).

## Agent/token policy (Adam's standing instruction)

Small/simple work (research lookups, boilerplate pages, email templates, scripts-from-skeletons,
test specs) → **sonnet or haiku subagents**. Correctness-critical core (schema, money, time math,
payment/webhook/cron logic, landing page) → **Fable directly**. Don't launch big agent fleets;
session limits are tight. Commit after every stage.

## Build status (single source of progress truth)

**Rule for every agent/session: read this section before working; after finishing a stage, tick it here and append what/why/decisions to [docs/03-execution-log.md](docs/03-execution-log.md), then commit.**

- [x] Phase 0 — stack locked, repo prepped (.gitignore, docs/00)
- [x] Phase 1 — research: fleet hit session limit; salvaged as Verification TODOs (plan §13). V-1…V-5 pending, run cheaply pre-stage.
- [x] Phase 2 — master plan written + self-reviewed → docs/02-master-plan.md
- [x] GATE: Adam approved full execution
- [x] 3.0 scaffold (Next 16.2.9 · Tailwind 4.3 · sharp 0.35) · [x] 3.1 schema+RLS+seed written (**DB boot blocked: Docker Desktop service needs Adam's manual click**) · [x] 3.2 core libs · [x] 3.3 checkout/webhook/cron + mock checkout
- [x] 3.4 donor UI (Fable) · [x] 3.5 kitchen portal · [x] 3.6 admin (32 files) · [x] donor portal + PDF receipts · [x] 3.7 emails/blur/qr/seed-images · [x] 3.8 firebase configs + bash bootstrap scripts + README
- [x] **PRODUCTION BUILD PASSES** (all 35+ routes compile)
- [x] **CLOUD DB LIVE** — Supabase `htcmvczrrabikzvaatfo` (ap-south-1): schema+RLS+seed applied, 12 seed images, `/api/health` green. (`.env.local` points here; local Docker path unchanged for later.)
- [x] **PHASE 4 — 20/20 PLAYWRIGHT GREEN** against cloud → [docs/04-test-report.md](docs/04-test-report.md). Caught+fixed 3 real bugs (admin pw-change trap, jsonb-NOT-NULL clock leak, dup_of column).
- Run tests: `node scripts/fix-auth.mjs` (repair seed logins on cloud) then `npm run test:e2e`.
- **Still local-blocked:** Docker Desktop wedged (Windows `PendingFileRenameOperations` → needs a reboot). Not required — everything runs on cloud now. After reboot, `npm run setup` boots the local stack.
- **Remaining (optional next pass):** deploy via `scripts/firebase-init.sh`+`deploy.sh` (needs Adam's Firebase login + Blaze click); dedicated specs for classroom / 3G-offline / blur / force-send (features built, not yet E2E-automated). Day-2 Stripe: `scripts/stripe-init.sh` + flip `PAYMENT_PROVIDER=stripe`.
- Day 2 (when Stripe keys arrive): `stripe-init.sh`, flip `PAYMENT_PROVIDER=stripe`, smoke test.
