# FeedSomeone — Locked Stack Decisions (Founder-Approved)

> Recorded 2026-06-10, from the live Q&A between Adam (CAIO) and the orchestrator,
> **before** Phase 1 research began. These decisions supersede the hosting rows of the
> original super-master-prompt. Everything else in the brief stands — features may be
> ADDED creatively, never removed.

## The Locked Stack

| Layer | Choice | Why |
|---|---|---|
| App + API | **Next.js (App Router, TypeScript)** | Brief's choice, confirmed. |
| Database / Auth / Storage / Realtime | **Supabase (Postgres)** | Confirmed by Adam after Firebase-vs-Supabase discussion. Postgres gives atomic sequential receipt numbers, `SELECT … FOR UPDATE SKIP LOCKED` for one-photo-one-donor FIFO, relational accounting (donations vs tips), RLS for the three roles. |
| Production hosting | **Firebase App Hosting** | Adam's call — Firebase ecosystem + pay-as-you-go. **No Vercel** (personal boycott). **No Render** (rejected as "too bad"). |
| Production cron engine | **Firebase scheduled functions (v2)** | A Firebase project exists anyway for hosting; scheduled functions fire HTTPS calls at Next.js cron API routes protected by `CRON_SECRET`. |
| Payments | **Stripe — MOCKED Day 1** | `PaymentProvider` interface; `PAYMENT_PROVIDER=mock|stripe` env flip. Real keys arrive Day 2. |
| Email | **Resend** | Behind a swappable `EmailProvider`; local mode captures emails to a dev mailbox (no key needed today). |

## Session Mode

- **Local-first today**: full local Supabase stack via Docker + supabase CLI, mock payments,
  captured emails. No cloud keys were available at build time.
- **Deploy-ready, not deployed**: Firebase + Supabase cloud bootstrap scripts ship
  one-command-ready; Adam flips them when keys arrive. (His choice: "Deploy-ready scripts".)
- Later ambition mentioned by Adam: Firebase Hosting end-state — already satisfied by this stack.

## Standing Instructions from Adam

1. Complete all four phases: Research → Plan → Execute → Test.
2. Use agent teams throughout.
3. **Do not remove anything from the brief — only ADD creatively.**
4. No further questions after the stack Q&A. Heads-down to completion.

## Founder Context (from the brief)

- **Danish Ahmed** — Co-founder, Operations & Kitchens. Locked the UX spec (§❷.5 of the brief):
  homepage order, no currency picker, tip framing (never "keep the lights on"),
  scheduled-email logic (N children × D days = D emails of N photos), mobile-first everywhere —
  he runs operations from his phone.
- **Adam Ahmed** — Co-founder, Technology (CAIO). Drives this build.
- Domain: **feedsomeone.org** · Contact: **hello@feedsomeone.org**
- Only manual founder step allowed: **Stripe keys on Day 2.** Everything else automated via scripts,
  or documented as a numbered README exception with justification.
