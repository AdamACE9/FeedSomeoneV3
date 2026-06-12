# FeedSomeone — Phase 4 Test Report

> Author: Fable 5. Environment: Next.js dev server + **live cloud Supabase**
> (`htcmvczrrabikzvaatfo`, ap-south-1) + mock payment provider + local email capture
> (`email_outbox`). Browser: Playwright (bundled Chromium). `TEST_MODE=1` enables the
> injectable clock. Suite: `npm run test:e2e`.

## Result

**20 / 20 Playwright test entries green** (19 spec files; `19` splits into 19-A and 19-B).
Wall-clock ≈ 6 min, `workers: 1` (serial — the specs share one cloud database).
No soft-skips: every assertion path executes.

```
20 passed (6.1m)
```

Evidence screenshots are written to `tests/evidence/` on each run (landing, thanks,
kitchen upload, admin dashboard, accounting, etc.).

## Scenario coverage (brief §❼ → specs)

| # | Brief scenario | Spec(s) | Status |
|---|---|---|---|
| 1 | Landing loads, live counter, currency | 01, 17, 18 | ✅ |
| 2 | Guest donates ₹25 → receipt + photo email at scheduled minute | 02 | ✅ |
| 3 | ₹250 / 10 children / +25% tip, donation vs tip separated | 03 | ✅ |
| 4 | Monthly recurring → next-cycle charge via cron | 07 | ✅ |
| 5 | Feed a Classroom (30) | DonateForm toggle | ⚙️ built (UI verified; no dedicated spec) |
| 6 | Dedicate "In memory of …" on receipt + email | 06 | ✅ |
| 7 | Gift a meal → recipient notified | 05 | ✅ |
| 8 | PDF receipt (auth-gated) | 11 | ✅ (401 enforcement; PDF renders via pdf-lib) |
| 9 | Pause/resume/cancel recurring | portal + 07 | ✅ (subscription lifecycle) |
| 10 | USD / AED conversion, INR stored alongside | 18 | ✅ (USD; INR canonical asserted) |
| 11 | Meal streak badge in email | 12 (3-day) | ✅ |
| 12 | Anniversary email +1 year, original photo | 13 | ✅ |
| 13–14 | Kitchen mobile login + upload + counters | 14 | ✅ |
| 15 | Kitchen slow-3G offline queue | Uploader (localStorage queue) | ⚙️ built (queue logic in code; not E2E-throttled) |
| 16 | Admin login → dashboard counts | 15 | ✅ |
| 17 | Duplicate-photo detection (pHash) | 14 | ✅ (re-upload → `flagged`) |
| 18 | Admin background blur | `lib/blur.ts` + admin UI | ⚙️ built (server-side sharp; no dedicated spec) |
| 19 | Admin force-send | admin UI action | ⚙️ built (no dedicated spec) |
| 20 | Admin QR generator → prefilled donate | 16 | ✅ |
| 21 | Separated accounting (donations vs tips) | 03 (DB), 15 (UI) | ✅ |
| 22 | 60-s delivery worker fires at scheduled time | 02, 12, 13 (clock + tick) | ✅ |
| 23 | 5-min retry worker on empty pool | 09 | ✅ (launch-critical path) |
| 24 | Daily recurring worker | 07 | ✅ |
| 25 | FIFO-by-country assignment, one-photo-one-donor | 10, 19-A | ✅ (FIFO order + 23505 uniqueness) |

⚙️ = feature is implemented and compiles into the production build; it just doesn't have
a dedicated automated spec yet. Candidates for the next test pass.

## Time travel & determinism

- **Injectable clock** (`lib/clock.ts` + `app_settings.clock_override`, `TEST_MODE` only):
  specs freeze/advance time to test photo-delivery-at-the-exact-minute (02), streaks (12),
  anniversaries (13) without waiting. Cron endpoints are invoked directly with `CRON_SECRET`.
- **Email assertions** query the `email_outbox` table (local provider).
- **Pool-sensitive specs** (04 scheduled, 19-A constraint) reset and pin the photo pool in
  `beforeAll`, so they pass regardless of what earlier specs consumed from the shared pool.

## Bugs found & fixed during Phase 4

The suite earned its keep — it surfaced three **real product/infra bugs** (not test issues):

1. **Forced-password-change trap (cloud).** `adminChangePasswordAction` called
   `auth.getUser()` *after* rotating the password; on cloud that returns null, so
   `must_change_password` was never cleared yet the action still returned `ok` — the admin
   bounced back to the password page forever. Fixed: capture identity *before* rotation,
   with a service-role fallback by email. (`src/lib/admin-actions.ts`)
2. **Clock override could never be cleared.** `app_settings.value` is `jsonb NOT NULL`, so
   `upsert({value:null})` silently violated the constraint. Once any time-travel test set the
   clock to a future date, it **leaked into every later request** — poisoning donation
   `paid_at` (live counter read 0) and the anniversary worker's window. Fixed: DELETE the row
   to clear. (`src/lib/clock.ts`) — a latent production footgun, not just a test concern.
3. **Duplicate-detection `dup_of` never populated.** The upload route read `dupRows[0].id`,
   but `find_similar_photo` aliases the column `photo_id`. Fixed. (`src/app/api/photos/upload`)

Test-harness fixes (Chromium pin; `networkidle`→`domcontentloaded` only on the SSE landing
page; pay-button keyed on the `·…→` shape; `role="radio"` frequency buttons; machine-tz→INR
currency pin; valid sharp-generated test JPEGs; PostgREST embedded-order; deterministic admin
reset) are detailed in [03-execution-log.md](03-execution-log.md).

## Known caveats

- **Seeded auth on cloud:** the raw-SQL `auth.users` password hashes aren't GoTrue-valid;
  `scripts/fix-auth.mjs` repairs admin + kitchen logins (wired into `supabase-init.sh --cloud`).
  Run it after a fresh cloud bootstrap.
- **No Docker this session:** Docker Desktop was wedged (pending Windows reboot), so all
  testing ran against cloud Supabase instead of the local stack. The local path
  (`npm run setup`) is unchanged and ready once Docker is back.
- ⚙️ scenarios above (classroom, 3G offline, blur, force-send) are build-verified; adding
  dedicated specs is the obvious next increment.
