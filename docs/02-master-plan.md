# FeedSomeone — Master Plan (Phase 2)

> Author: Fable 5 (orchestrator), 2026-06-12. Stack per [00-stack-decisions.md](00-stack-decisions.md).
> Status of Phase 1: the 21-agent research fleet was killed by the session token limit before producing
> reports. This plan is written from the orchestrator's own knowledge (cutoff Jan 2026) with a short
> **Verification TODO** list (§13) of load-bearing facts to confirm cheaply before the relevant build stage.
> The brief's research scope is preserved — slimmed, not removed.

---

## 1. Architecture

```mermaid
flowchart LR
  subgraph Client
    D[Donor site /] -- checkout --> A
    K[Kitchen portal /kitchen] -- upload --> A
    AD[Admin /admin] --> A
  end
  subgraph NextJS [Next.js App Router — Firebase App Hosting (prod) / localhost (dev)]
    A[Server Actions + Route Handlers]
    W[/api/webhooks/payment/]
    C[/api/cron/tick + /api/cron/daily/]
  end
  subgraph Supabase [Supabase (local Docker today / cloud later)]
    PG[(Postgres + RLS)]
    ST[(Storage: photos, receipts)]
    AU[Auth: kitchen+admin pw, donor magic link]
    RT[Realtime: live counter]
  end
  PP{{PaymentProvider\nmock | stripe}} -. synthetic or real webhooks .-> W
  EP{{EmailProvider\nlocal | resend}}
  A --> PG & ST & AU
  A --> PP
  C --> EP
  C --> PG
  SCHED[Firebase scheduled functions\n(prod) / dev-cron loop (local)] -- HTTPS + CRON_SECRET --> C
  RT --> D
```

**Core flow:** checkout → `donations(pending)` → `PaymentProvider.createCheckout` → webhook (`mock` posts a synthetic, HMAC-signed, Stripe-shaped event to the same endpoint) → on `checkout.completed`: mark paid → allocate receipt → record tip separately → ensure guest donor → update streak → **assign photos** (FIFO `FOR UPDATE SKIP LOCKED` by country) → create `deliveries` with `scheduled_at` = next occurrence of the photo's wall-clock time in the donor's timezone → 60-second cron tick sends due emails inline-photo → counter broadcasts.

**Provider pattern (the spine of Day-1→Day-2):** `PaymentProvider` and `EmailProvider` interfaces; `PAYMENT_PROVIDER=mock|stripe`, `EMAIL_PROVIDER=local|resend`. Mock/local write real DB rows; swapping is one env flip, zero code changes.

---

## 2. Database Schema (migration `supabase/migrations/0001_init.sql`)

```sql
create extension if not exists citext;
create extension if not exists pgcrypto;

create type user_role          as enum ('donor','kitchen','admin');
create type donation_type      as enum ('one_time','scheduled','recurring_cycle');
create type donation_status    as enum ('pending','paid','failed','refunded');
create type photo_status       as enum ('available','assigned','delivered','flagged','rejected');
create type day_status         as enum ('unassigned','partial','assigned','delivered');
create type delivery_status    as enum ('waiting','scheduled','sent','failed');
create type sub_status         as enum ('active','paused','canceled');
create type sub_cadence        as enum ('daily','weekly','monthly');
create type dedication_kind    as enum ('memory','honor');

-- ── reference ────────────────────────────────────────────────
create table countries (
  code        text primary key,            -- 'IN','AE','US'
  name        text not null,
  enabled     boolean not null default true
);

create table kitchens (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text not null,
  country_code text not null references countries(code),
  tz          text not null default 'Asia/Kolkata',
  contact_email citext,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── identity ─────────────────────────────────────────────────
create table profiles (                     -- 1:1 with auth.users (kitchen+admin; donors when they log in)
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'donor',
  kitchen_id  uuid references kitchens(id),
  display_name text,
  must_change_password boolean not null default false,
  created_at  timestamptz not null default now()
);

create table donors (                       -- guest-first; user_id linked lazily on magic-link login
  id          uuid primary key default gen_random_uuid(),
  email       citext unique not null,
  first_name  text,                         -- shown max 10 chars; null => "Someone"
  is_anonymous boolean not null default false,
  user_id     uuid unique references auth.users(id),
  currency    text not null default 'INR' check (currency in ('INR','USD','AED')),
  tz          text not null default 'Asia/Kolkata',
  first_donation_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ── money ────────────────────────────────────────────────────
create table subscriptions (
  id          uuid primary key default gen_random_uuid(),
  donor_id    uuid not null references donors(id),
  cadence     sub_cadence not null,
  quantity    int not null check (quantity > 0),
  currency    text not null check (currency in ('INR','USD','AED')),
  amount_local bigint not null,             -- smallest unit per cycle (meals only, no tip)
  tip_local   bigint not null default 0,    -- tip per cycle, kept separate downstream
  status      sub_status not null default 'active',
  provider    text not null,                -- 'mock' | 'stripe'
  provider_sub_id text unique,
  country_pref text references countries(code),
  next_charge_at timestamptz,               -- used by mock; informational for stripe
  created_at  timestamptz not null default now()
);

create table donations (
  id          uuid primary key default gen_random_uuid(),
  donor_id    uuid not null references donors(id),
  type        donation_type not null default 'one_time',
  status      donation_status not null default 'pending',
  quantity_total int not null check (quantity_total > 0),
  days        int not null default 1 check (days >= 1),
  per_day_quantity int not null,
  is_classroom boolean not null default false,   -- 30-pack => one collective email/photo set
  currency    text not null check (currency in ('INR','USD','AED')),
  amount_local bigint not null,             -- meals only, smallest unit
  amount_inr  bigint not null,              -- paise, fixed-rate conversion
  country_pref text references countries(code),
  donor_tz    text not null default 'Asia/Kolkata',
  subscription_id uuid references subscriptions(id),
  qr_campaign_id uuid,
  provider    text not null,
  provider_session_id text unique,
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  check (per_day_quantity * days = quantity_total)
);

create table tips (                          -- NEVER mixed with donations
  id          uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references donations(id),
  percent     int not null,
  amount_local bigint not null,
  currency    text not null,
  amount_inr  bigint not null,
  created_at  timestamptz not null default now()
);

create table receipts (
  id          uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references donations(id),
  number      text not null unique,          -- FS-YYYYMMDD-0001
  issued_at   timestamptz not null default now()
);

create table receipt_counters (
  date_key    text primary key,              -- 'YYYYMMDD' in Asia/Kolkata
  counter     int not null
);

create or replace function allocate_receipt(p_donation_id uuid)
returns text language plpgsql as $$
declare v_key text := to_char(now() at time zone 'Asia/Kolkata','YYYYMMDD');
        v_n int; v_number text;
begin
  insert into receipt_counters(date_key, counter) values (v_key, 1)
    on conflict (date_key) do update set counter = receipt_counters.counter + 1
    returning counter into v_n;
  v_number := 'FS-' || v_key || '-' || lpad(v_n::text, 4, '0');
  insert into receipts(donation_id, number) values (p_donation_id, v_number);
  return v_number;
end $$;

-- ── photos & delivery engine ─────────────────────────────────
create table photos (
  id          uuid primary key default gen_random_uuid(),
  kitchen_id  uuid not null references kitchens(id),
  country_code text not null references countries(code),
  storage_path text not null,
  blurred_path text,
  kitchen_note text,                         -- optional 1-liner from the kitchen (creative add)
  taken_at    timestamptz not null,          -- upload moment = capture moment
  tz          text not null,                 -- kitchen tz at capture
  phash       bit(64),
  status      photo_status not null default 'available',
  dup_of      uuid references photos(id),
  created_at  timestamptz not null default now()
);
create index photos_fifo on photos (status, country_code, taken_at);

create table donation_days (                 -- "5 children × 7 days" => 7 rows of qty 5
  id          uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations(id),
  day_index   int not null,                  -- 1..days
  quantity    int not null,
  status      day_status not null default 'unassigned',
  unique (donation_id, day_index)
);

create table photo_assignments (             -- one photo, one donor, no reuse
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null unique references photos(id),
  donation_day_id uuid not null references donation_days(id),
  donor_id    uuid not null references donors(id),
  assigned_at timestamptz not null default now()
);

create table deliveries (                    -- one email per donation_day
  id          uuid primary key default gen_random_uuid(),
  donation_day_id uuid not null unique references donation_days(id),
  donor_id    uuid not null references donors(id),
  recipient_email citext not null,           -- donor, or gift recipient
  scheduled_at timestamptz,                  -- null while waiting for photos
  status      delivery_status not null default 'waiting',
  attempt_count int not null default 0,
  sent_at     timestamptz,
  last_error  text
);
create index deliveries_due on deliveries (status, scheduled_at);

-- atomic FIFO assignment: returns photo ids it locked+assigned
create or replace function assign_photos(p_day_id uuid, p_donor uuid, p_n int, p_country text)
returns setof uuid language plpgsql as $$
declare r record;
begin
  for r in
    select id from photos
    where status = 'available'
      and (p_country is null or country_code = p_country)
    order by taken_at asc
    limit p_n
    for update skip locked
  loop
    update photos set status = 'assigned' where id = r.id;
    insert into photo_assignments(photo_id, donation_day_id, donor_id) values (r.id, p_day_id, p_donor);
    return next r.id;
  end loop;
end $$;

-- ── extras ───────────────────────────────────────────────────
create table dedications (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references donations(id),
  kind dedication_kind not null,
  name text not null
);

create table gifts (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references donations(id),
  recipient_name text not null,
  recipient_email citext not null,
  message text,
  notified_at timestamptz
);

create table streaks (
  donor_id uuid primary key references donors(id),
  current int not null default 0,
  longest int not null default 0,
  last_date date                              -- donor-tz date of last counted donation
);

create table qr_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kitchen_id uuid references kitchens(id),
  preset_quantity int not null default 1,
  country_pref text references countries(code),
  scans int not null default 0,
  created_at timestamptz not null default now()
);
alter table donations add constraint donations_qr_fk
  foreign key (qr_campaign_id) references qr_campaigns(id);

create table email_outbox (                  -- local mailbox in dev; email log in prod
  id uuid primary key default gen_random_uuid(),
  to_email citext not null,
  subject text not null,
  html text not null,
  kind text not null,                        -- receipt|photo|gift_notice|anniversary|...
  ref_id uuid,
  provider text not null,                    -- 'local' | 'resend'
  provider_id text,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create table webhook_events (                -- idempotency
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  unique (provider, event_id)
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity text, entity_id text,
  meta jsonb,
  at timestamptz not null default now()
);

create table app_settings (                  -- stats thresholds, clock override (tests), fx
  key text primary key,
  value jsonb not null
);
```

**RLS stance:** RLS enabled on every table, **deny-by-default**. All server mutations use the service-role key (server-only). Read policies: donors read rows where `donors.user_id = auth.uid()` (donations/deliveries/receipts via join); kitchens read own kitchen + own photos (`profiles.kitchen_id`); admins (`profiles.role='admin'`) read all. Storage: `photos` bucket private — emails and portal use **signed URLs**; `receipts` bucket private. Policies written per-table in migration `0002_rls.sql`.

**Seed (`supabase/seed.sql`):** countries IN/AE/US; admin user `admin@feedsomeone.com` / `Admin@123` with `must_change_password=true`; demo kitchen "Noor Kitchen, Hyderabad" (`kitchen@feedsomeone.com` / `Kitchen@123`); 12 sample photos with staggered `taken_at`; `app_settings`: `stats_thresholds {meals:500, donors:100}`, `fx {usd_inr:83, aed_inr:22.6}`.

---

## 3. File / Folder Structure

```
src/
├── app/
│   ├── (site)/                       # donor-facing, mobile-first
│   │   ├── page.tsx                  # landing — LOCKED §❷.5 order
│   │   ├── donate/page.tsx           # checkout (qty chips 1/5/10/30, schedule, dedicate, gift, tip)
│   │   ├── thanks/[donationId]/page.tsx
│   │   ├── portal/page.tsx           # magic-link gated donor portal
│   │   ├── portal/login/page.tsx
│   │   ├── kitchens/page.tsx         # Open Kitchen trust page (creative add)
│   │   └── q/[slug]/route.ts         # QR redirect → /donate?prefill
│   ├── mock-checkout/[sessionId]/page.tsx   # Day-1 fake Stripe page (succeed/fail buttons)
│   ├── kitchen/                      # kitchen portal (login, upload, stats)
│   ├── admin/                        # dashboard, photos, donors, kitchens, countries,
│   │                                 #   accounting, qr, settings, force-password-change
│   ├── dev/mailbox/page.tsx          # local email viewer (dev only)
│   └── api/
│       ├── webhooks/payment/route.ts # ONE handler: mock + stripe events
│       ├── cron/tick/route.ts        # every minute (deliveries + every-5th-tick retry)
│       ├── cron/daily/route.ts       # recurring charges + anniversaries
│       ├── checkout/route.ts         # POST create donation + provider session
│       ├── photos/upload/route.ts    # kitchen multi-upload (phash, dup check)
│       ├── receipts/[number]/pdf/route.ts
│       ├── counter/route.ts          # live counter snapshot (+ Realtime on client)
│       ├── qr/[id]/png/route.ts
│       └── health/route.ts
├── components/  (ui/, landing/, checkout/, kitchen/, admin/, portal/)
├── lib/
│   ├── supabase/ (server.ts admin client, browser.ts, middleware.ts route guards)
│   ├── payments/ (types.ts, mock.ts, stripe.ts, index.ts ← env switch)
│   ├── email/    (types.ts, local.ts, resend.ts, index.ts)
│   ├── money.ts      # smallest-unit math, fixed FX, per-currency minimums
│   ├── timewindow.ts # photo wall-clock → donor-tz next occurrence (date-fns-tz)
│   ├── assignment.ts # day batching, assign_photos RPC, delivery scheduling
│   ├── receipts.ts   # allocate via RPC; PDF via pdf-lib
│   ├── streaks.ts, anniversaries.ts, phash.ts (sharp dHash), blur.ts, qr.ts
│   ├── geo.ts        # IP → currency (headers → fallback API → USD)
│   └── clock.ts      # now() — honors app_settings.clock_override when TEST_MODE=1
├── emails/           # react-email: Receipt, PhotoDelivery, GiftNotice, Anniversary,
│                     #   RecurringReceipt, PaymentFailed, KitchenWelcome
functions/            # Firebase scheduled fns: every-minute + daily → HTTPS to /api/cron/*
supabase/  (config.toml, migrations/, seed.sql)
scripts/   (bootstrap.sh, supabase-init.sh, stripe-init.sh, firebase-init.sh,
            resend-init.sh, deploy.sh, verify.sh, dev-cron.mjs)
tests/     (playwright.config.ts, e2e/*.spec.ts, helpers/, evidence/)
apphosting.yaml · firebase.json · .firebaserc · .env.example
```

---

## 4. API Surface (auth in parentheses)

| Method/Path | Purpose | Notes |
|---|---|---|
| POST `/api/checkout` (public) | Create donor+donation(+days,+tip,+dedication,+gift)=pending; return provider checkout URL | Validates per-currency minimums (see §11 R1) |
| POST `/api/webhooks/payment` (signature) | `checkout.completed` → paid: receipt, streak, assign, schedule. `invoice.paid` → new recurring_cycle donation, same flow. `*.failed` → mark + email | Idempotent via `webhook_events` unique |
| POST `/api/photos/upload` (kitchen) | Store original → phash → dup check (`bit_count(phash # $1) <= 6` ⇒ `flagged`) → row | Multi-file; ≤44px targets in UI |
| GET `/api/counter` (public) | `{ fedToday, totalMeals, donors, kitchens }` | Day = Asia/Kolkata; Realtime push on top |
| POST `/api/cron/tick` (CRON_SECRET) | Send due deliveries; every 5th minute retry `waiting` days via `assign_photos` | Batch ≤ 50/run |
| POST `/api/cron/daily` (CRON_SECRET) | Mock-subscription charges due → synthetic invoice events; anniversary emails (first_donation_at = today−1y, donor-tz) | Stripe handles real recurring billing itself |
| GET `/api/receipts/[number]/pdf` (donor/admin) | pdf-lib receipt | |
| Server actions (admin) | kitchens/countries/donors CRUD, blur photo, force-send, merge/delete dup, QR create | All audit-logged |
| Server actions (portal) | pause/resume/cancel subscription, resend receipt | |
| GET `/api/health` (public) | env+DB+storage+provider sanity for `verify.sh` | |

**Mock checkout UX:** `/mock-checkout/[sessionId]` shows amount + **"Pay (test)"** / **"Fail (test)"** buttons → POSTs HMAC-signed synthetic event to the webhook → redirects to `/thanks/...`. `MOCK_AUTOCONFIRM=1` skips the page for tests.

---

## 5. Background Jobs

| Job | Schedule | Logic | Idempotency / Failure |
|---|---|---|---|
| **tick** | every 1 min (Firebase `onSchedule('* * * * *')`; local `dev-cron.mjs` 60s loop) | `deliveries where status='scheduled' and scheduled_at <= now()` → render PhotoDelivery email (signed photo URLs, streak badge, "Day X of D · N meals", dedication, kitchen note) → send → `sent`; photos → `delivered`; day → `delivered` | Row-level status guard + `attempt_count`; ≥5 fails → `failed` + admin flag. Email idempotency key = delivery id |
| **retry unassigned** | inside tick when `minute % 5 = 0` | `donation_days where status in ('unassigned','partial')` oldest-first → `assign_photos` top-up → when full: compute `scheduled_at` from earliest photo wall-clock in donor tz (past-today ⇒ tomorrow) → `scheduled` | `assign_photos` is atomic (SKIP LOCKED); partial stays partial |
| **recurring (mock)** | daily 00:05 IST | `subscriptions where provider='mock' and status='active' and next_charge_at <= now()` → create donation(recurring_cycle, paid) via same paid-pipeline + advance `next_charge_at` | Unique `(subscription, cycle-date)` session id |
| **anniversary** | daily 09:00 donor-tz approximation (run hourly window check in daily job — simplification: send at 09:00 IST) | donors with `first_donation_at::date = today − interval '1 year'` → Anniversary email re-attaching first photo | `email_outbox` kind+ref unique check |
| **streaks** | computed at payment success (`lib/streaks.ts`), not a job | consecutive donor-tz dates; thresholds 3/7/14/30/100 ⇒ badge in next photo email | Pure function of dates — recomputable |

---

## 6. Pages (key states)

**Donor:** `/` — locked §❷.5 order: brand mark → live counter pill → "Feed one child right now." → subline → CTA "Feed one child · ₹25 →" (local currency) → hero photo above fold captioned "Fed by {first≤10|Someone} in {city}" + timestamp → 10-photo carousel (scroll-snap, live dot) → scroll-drawn 4-step How-It-Works (IntersectionObserver, reduced-motion fallback) → dark stats band (count-up; numbers hidden until env thresholds; zero-admin-fee badge always) → team section (Danish, Adam, hello@feedsomeone.org). Empty-pool day-one state: carousel shows "The first photos arrive when kitchens open — be the donor who triggers one."
`/donate` — qty stepper + chips 1/5/10/30 + free type; Classroom=30 toggle; schedule (N/day × D days picker); dedicate; gift; tip picker (No thanks…+50%, **+25% default**); green badge "We charge no admin fee — 100% of ₹{amount} feeds children."; separate meal/tip lines; "Charged in your local currency."; email field; pay button.
`/thanks/[id]` — receipt number, **anticipation panel** (live: "waiting for a kitchen" → "your photo is scheduled for {time}"), share card.
`/portal` — donations list, photo gallery (timestamps), schedules (pause/resume/cancel), receipt PDFs. Magic-link login.
**Kitchen** `/kitchen` — login; upload screen: giant camera button, multi-select, offline queue (localStorage + Background-Sync-style retry), optional 1-line note, today/all-time counters.
**Admin** `/admin` — stats (photos in pool, pending deliveries, active donors, today's donations per currency, tips today **separate**); photos (pool grid + flagged dups side-by-side merge/delete + one-click blur + force-send); donors (search, history, streak); kitchens (CRUD + per-kitchen stats); countries (toggle); accounting (donations vs tips, always split, CSV export); QR generator (name → slug → printable PNG poster); settings (thresholds, fx display); first-login forced password change.

---

## 7. Emails (react-email; all carry timestamp motif + receipt number in DM Mono)

| Template | Trigger | Subject |
|---|---|---|
| Receipt | payment success | "Receipt FS-… — you fed {N} {child/children}" |
| PhotoDelivery | tick at scheduled_at | "{time}. This meal just happened." — N inline photos (hosted signed URLs, 600px, <102KB HTML), streak badge, Day X of D, dedication line, kitchen note |
| GiftNotice | gift paid | "{donor} fed a child in your name" |
| Anniversary | +1 year | "A year ago today, you fed a child." (original photo re-attached) |
| RecurringReceipt | each cycle | compact receipt |
| PaymentFailed | failed event | gentle retry CTA |
| KitchenWelcome | admin creates kitchen | credentials + 3-step how-to |

---

## 8. Environment (`.env.example` — every key documented in file)

`NEXT_PUBLIC_SITE_URL` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_ACCESS_TOKEN` (cloud bootstrap only) · `PAYMENT_PROVIDER=mock|stripe` · `MOCK_WEBHOOK_SECRET` · `MOCK_AUTOCONFIRM` · `STRIPE_SECRET_KEY` · `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` · `STRIPE_WEBHOOK_SECRET` · `EMAIL_PROVIDER=local|resend` · `RESEND_API_KEY` · `EMAIL_FROM=photos@feedsomeone.org` · `CRON_SECRET` · `TEST_MODE` · `GEO_FALLBACK_CURRENCY=USD` · `STATS_MIN_MEALS=500` · `STATS_MIN_DONORS=100`

---

## 9. Bootstrap Scripts (bash; Windows via Git Bash — ships with user's git)

| Script | Does | Human needs |
|---|---|---|
| `bootstrap.sh` | checks node/docker → npm i → supabase-init → seed → .env.local written from `supabase status` → optional dev start | nothing |
| `supabase-init.sh` | local: `npx supabase init/start`, `db reset` (migrations+seed), gen types. Cloud (token present): `projects create`, `link`, `db push`, buckets via migration, prints keys | token only for cloud |
| `stripe-init.sh` (Day 2) | ensures webhook endpoint via API (exact event list), prints env lines; `stripe listen` helper for local | Stripe keys |
| `firebase-init.sh` / `deploy.sh` | `firebase projects:create`, enable APIs, App Hosting backend, functions deploy, secrets set | Google login + **Blaze billing click** (README exception #1 — Google requires a human card click; cannot be bashed) |
| `resend-init.sh` | registers domain via API, prints DNS table, polls verification | API key; paste DNS at registrar (exception #2 — registrar-dependent) |
| `verify.sh` | curls `/api/health`, checks each subsystem | nothing |

`npm run setup` → `bash scripts/bootstrap.sh`.

---

## 10. Test Plan (Phase 4)

**Stack:** Playwright (repeatable suite, `webServer` against dev + local Supabase, storageState fixtures per role) + agent-driven Chrome DevTools MCP passes (mobile viewports 390×844 / 360×800, slow-3G kitchen test, screenshot evidence → `tests/evidence/`) . **Time travel:** `lib/clock.ts` + `app_settings.clock_override` (TEST_MODE only) — tests set the clock, hit `/api/cron/*` directly, assert. **Email asserts:** query `email_outbox`. **Brief's 25 scenarios** map: 1–12 donor (Playwright; #2 photo-timing + #11 streak + #12 anniversary via clock override), 13–15 kitchen (agent-driven mobile + offline), 16–21 admin (Playwright + agent), 22–25 engine (API-level + SQL assertions incl. FIFO proof: seed 3 photos t1<t2<t3, two donations, assert assignment order). Report → `docs/04-test-report.md` (green/red matrix + screenshots).

---

## 11. Risk Register

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Stripe minimum charge** (~$0.50 / 2.00 AED) makes 1 child below minimum in USD ($0.31) & AED (1.11) | Per-currency min quantity: INR 1, USD 2, AED 2, with honest one-line note at checkout. INR hero unaffected. Decided now, in checkout validation + copy |
| R2 | Session token limits (already bit Phase 1) | Plan lives in CLAUDE.md+docs; stages commit independently; cheap models for simple work; resumable at any stage |
| R3 | Firebase App Hosting deploy may prefer GitHub connection | Repo already on GitHub ✓; verify CLI-only path in V-3 (§13) |
| R4 | Resend `scheduled_at` horizon limits | We schedule via our own cron-queue (tick), not scheduled_at — immune. Decided |
| R5 | Photo pool empty at launch (kitchens upload after handoff) | `waiting` state + 5-min retry is launch-critical path; thanks-page anticipation panel makes the wait a feature; admin pending-count alert |
| R6 | sharp on Firebase App Hosting (native binary) | sharp ships prebuilt for linux-x64/arm64; pin version; verify in V-4 |
| R7 | Background blur without ML segmentation is approximate | v1: center-weighted feathered blur (honest "privacy blur"); v2 flag: person segmentation |
| R8 | Donor tz wrong/missing | Browser tz at checkout → currency-based fallback → Asia/Kolkata; portal lets donor fix tz |
| R9 | OneDrive folder + Docker/node_modules perf on Windows | Works, but note in README: move repo out of OneDrive if file-watcher issues appear |
| R10 | Gmail 102KB clip / image weight | Hosted signed URLs (no base64), single 600px image per photo, lean HTML |

## 12. Creative Additions (ship v1 unless flagged)

1. **Anticipation panel** on /thanks — live "a kitchen will cook this" → flips to scheduled time (Realtime).
2. **Kitchen note** — optional one-liner travels with the photo into the email.
3. **Open Kitchen page** `/kitchens` — verified partner list (trust).
4. **Dynamic OG share image** per donation ("I just fed 5 children") via `next/og`.
5. **Email log = dev mailbox** — same `email_outbox` powers local testing and prod ops transparency.
6. **Receipt in words** — "You fed five children." on receipt + PDF.
7. **QR poster mode** — print-ready A5 with brand + "Scan. ₹25. A child eats." (not just a bare PNG).
8. (v2) Real person-segmentation blur · monthly recap for recurring donors · annual impact card PDF.

## 13. Verification TODOs (slim Phase-1 salvage — cheap agents, pre-stage)

- V-1 (haiku, pre-scaffold): current Next.js stable major + create-next-app flags; Tailwind v4 setup.
- V-2 (haiku, pre-3.1): supabase CLI current local commands (`start`, `db reset`, `status -o env`) on Windows/npx.
- V-3 (sonnet, pre-deploy-scripts): Firebase App Hosting CLI-only rollout + functions v2 `onSchedule` minimum interval.
- V-4 (haiku, pre-3.2): sharp version + Postgres `bit_count(bit)` availability (PG15 local image).
- V-5 (haiku, Day-2): Stripe UPI/India presentment current status.

## 14. Execution Stages (Phase 3) — with model assignment (token policy)

| Stage | What | Who |
|---|---|---|
| 3.0 | Scaffold: create-next-app, Tailwind v4, fonts, design tokens, repo layout | **sonnet** (V-1 first) |
| 3.1 | Supabase local up; migrations 0001+0002(RLS); seed; types; storage buckets | **Fable** (schema = correctness core) |
| 3.2 | `lib/` core: money, clock, timewindow, phash, providers (payments/email), receipts, assignment, streaks | **Fable** |
| 3.3 | Checkout API + webhook handler + cron routes + mock-checkout page | **Fable** |
| 3.4 | Landing page + checkout UI + thanks + portal | **Fable** (landing+checkout) + **sonnet** (portal, thanks polish) |
| 3.5 | Kitchen portal (mobile-first, offline queue) | **sonnet** from my spec |
| 3.6 | Admin (dashboard, photos+blur+force-send, CRUD, accounting, QR) | **sonnet ×2 parallel** from my spec |
| 3.7 | Emails (react-email ×7) + PDF receipt + QR png + dev mailbox | **sonnet** |
| 3.8 | Scripts + apphosting.yaml + firebase.json + functions/ + README | **sonnet** (V-3 first) |
| 3.9 | Polish: a11y, reduced-motion, empty/loading/error states, mobile sweep | **Fable** review + targeted fixes |
| 4 | Test per §10, fix-loop, test report | **sonnet** agents + **Fable** triage |

Each stage: verify → commit → update CLAUDE.md status. Execution log → `docs/03-execution-log.md`.

---

### Self-review (plan verified)
Faults caught & fixed during this write: (1) Stripe per-currency minimums break 1-child USD/AED — added R1 + checkout rule. (2) Resend scheduled_at horizon risk — switched to own-queue scheduling (R4). (3) `deliveries.scheduled_at` must be nullable (`waiting`) for empty-pool launch path (R5) — schema reflects it. (4) Scheduled donations bill once upfront; only `recurring_cycle` rows come from subscriptions — prevents double-charging ambiguity. (5) Receipt day-key pinned to Asia/Kolkata so "sequential per day" is deterministic. (6) `photo_assignments.photo_id` UNIQUE enforces one-photo-one-donor at the constraint level, not just app logic.
