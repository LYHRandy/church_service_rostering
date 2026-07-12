# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Greenfield — no code exists yet. The single source of truth is `church-duty-management-prd.md` (v1.1, finalized for implementation). Read it before making design or implementation decisions; do not contradict it without flagging the deviation to the user.

## What This Is

A church duty (roster) management system: web dashboard (admin/roster editing) + Telegram bot (member-facing notifications, confirmations, swaps). Core differentiator is cross-ministry conflict detection — no member can be double-booked across any ministry or special event without an explicit override.

## Planned Architecture (from PRD §6)

Everything lives on Supabase except the frontend:

- **Frontend**: Next.js on Vercel, talks directly to Supabase via the client library — avoid custom API routes unless necessary
- **Database**: Supabase Postgres; the permissions matrix (PRD §4) is enforced with Row-Level Security policies, not application code
- **Telegram bot**: Supabase Edge Function (Deno runtime) running grammY, receiving webhooks at `/functions/v1/telegram-bot`. Use npm specifiers for Deno deps. Validate Telegram's `secret_token` header on every update. Respond fast: write to DB and acknowledge; slow sends go through the queue
- **Scheduler**: pg_cron + pg_net inside Postgres drives the reminder pipeline via `notification_queue`
- **Auth**: Telegram Login Widget → Edge Function verifies HMAC against bot token → mints Supabase session. No passwords anywhere
- **Storage**: Supabase Storage for service-order documents; bucket policies mirror duty-scoped access

### Key invariants

- **Conflict detection is implemented once**, as a single Postgres function, and called by every assignment path (dashboard, bot, swap flows). Never duplicate this logic in the frontend or bot.
- **All state-changing operations** (assign, confirm, swap approve, conflict override) go through Postgres functions so RLS and conflict rules apply identically from web and bot.
- **Roles are per-ministry** (one person can be Head of Media and Member of Ushering); Pastor and Staff are the only global roles.
- **Service Direction is a regular ministry**, not a special-cased entity — no dedicated tables or flags. Service-order permissions derive from holding a confirmed `service_director` assignment for that service date.
- **Roster editing is web-only**; Telegram is for notifications, confirmations, swap requests, `/duties`, `/roster`, and `/unavailable`.

## Build Order (PRD §6)

1. Schema + RLS policies (permissions matrix §4)
2. Conflict-check Postgres function + unavailability integration
3. Edge Function: Telegram webhook (linking, confirm, swap buttons)
4. pg_cron reminder pipeline + notification queue
5. Telegram Login auth flow for dashboard
6. Next.js dashboard: roster views → assignment UI → event wizard → service orders → reports

Rollout is phased (PRD §8): Phase 1 MVP excludes swaps, unavailability, special events, and service orders — those are Phase 2; assisted rotation, reports, and recurring templates are Phase 3.

## Open Questions

PRD §9 lists unresolved decisions (default duty buffer, roster visibility, reminder timing, non-Telegram fallback, etc.). If implementation forces one of these decisions, ask the user rather than assuming.

## Commands

The Supabase CLI is a root dev dependency — run it as `npx supabase` from the repo root. Dashboard commands run from `web/`.

```
npx supabase start                     # local stack (requires Docker Desktop running)
npx supabase db reset                  # replay migrations + seed.sql
npx supabase migration new <name>      # new migration file
npx supabase test db                   # pgTAP tests (supabase/tests/)
npx supabase functions serve <fn> --env-file supabase/.env.local
npx supabase gen types typescript --local > web/src/lib/database.types.ts

npm test                               # root: Vitest for edge-function logic (supabase/functions/**)

cd web && npm run dev                  # dashboard dev server (port 3000, or next free)
cd web && npm test                     # web Vitest (single test: npm test -- <pattern>)
cd web && npm run lint
cd web && npm run typecheck
cd web && npm run build
```

Edge-function handler logic lives in runtime-agnostic modules (`supabase/functions/_shared/`, `telegram-bot/bot.ts`) tested with root Vitest; only the thin `index.ts` entrypoints are Deno-specific. After changing RPCs/schema, regenerate types into `web/src/lib/database.types.ts`. Local bot testing uses the fake token + `TELEGRAM_BOT_INFO` in `supabase/.env.local` (see README).

Definition of done for any task: tests pass, typecheck + lint clean, `npx supabase db reset` succeeds from scratch. See `SPEC.md` (engineering contract) and `tasks/plan.md` / `tasks/todo.md` (task breakdown and progress).
