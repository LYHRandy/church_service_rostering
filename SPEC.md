# Spec: Church Duty Management System — Phase 1 MVP

**Source PRD:** `church-duty-management-prd.md` (v1.1) — product detail lives there; this spec is the engineering contract for building it.
**Scope:** Phase 1 MVP. The architecture supports all phases, but only MVP features are built now.

## Objective

Replace spreadsheet/group-chat duty rostering with one system: a web dashboard where admins manage rosters, and a Telegram bot where members receive assignments and reminders and confirm duties. The MVP must make double-booking impossible by accident — every assignment is conflict-checked across all ministries.

**Phase 1 MVP features** (PRD §8):
- Users, ministries, per-ministry roles (head / ic / member), global roles (pastor / staff)
- Duty slots (per service date/time/position/headcount) and manual assignment
- Member onboarding via Telegram deep link (`/start <token>`)
- Assignment confirm flow via Telegram inline buttons; `/duties` and `/roster` commands
- Conflict detection (single Postgres function) with explicit override + ⚠️ flagging
- Reminder pipeline: day-before ping via pg_cron → notification queue → edge function
- Web dashboard: Telegram login, full-year read-only roster (all logged-in users), assignment UI with live conflict warnings, member management, invite links, roster publish

**Explicitly deferred** (Phase 2+): swap workflow, unavailability, special events, service orders, assisted rotation, recurring templates, reports, audit log UI.

**Decisions resolved from PRD §9:**
- Telegram is required for all members in v1 — no SMS/email fallback; heads coordinate manually with non-Telegram members
- Telegram is the only login method in v1 (magic link can be added later without schema changes)
- Default conflict buffer: 2h when a duty has no end time, stored in a config table (not hardcoded)
- Reminders: day-before only in MVP; morning-of is a config flag left off

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript strict, Tailwind CSS, deployed on Vercel |
| Database | Supabase Postgres, RLS enforcing PRD §4 permissions matrix |
| Bot | grammY on Supabase Edge Functions (Deno, npm specifiers) |
| Scheduler | pg_cron + pg_net |
| Auth | Telegram Login Widget → edge function verifies HMAC → Supabase session |
| Local dev | Supabase CLI (local stack via Docker), migrations in `supabase/migrations/` |

## Commands

```
Dev (dashboard):    npm run dev                          # from web/
Dev (local stack):  supabase start                       # local Postgres + edge runtime
DB reset+migrate:   supabase db reset                    # replays migrations + seed.sql
New migration:      supabase migration new <name>
DB tests (pgTAP):   supabase test db
Unit tests:         npm test                             # from web/ (Vitest)
Single unit test:   npm test -- <file-or-pattern>
Lint:               npm run lint                         # from web/
Typecheck:          npm run typecheck                    # from web/ (tsc --noEmit)
Serve functions:    supabase functions serve telegram-bot --env-file supabase/.env.local
Deploy function:    supabase functions deploy telegram-bot
Gen DB types:       supabase gen types typescript --local > web/src/lib/database.types.ts
```

## Project Structure

```
supabase/
  migrations/        → Versioned SQL: schema, RLS policies, functions, pg_cron jobs
  functions/
    telegram-bot/    → Webhook handler (grammY): /start linking, confirm buttons, /duties, /roster
    telegram-auth/   → Login Widget HMAC verification → mints Supabase session
    send-notifications/ → Drains notification_queue → Telegram Bot API (invoked by pg_cron)
    _shared/         → Code shared between functions (telegram client, types)
  tests/             → pgTAP tests for RLS policies and conflict function
  seed.sql           → Local dev seed data (ministries, users, slots)
web/
  src/app/           → Next.js App Router pages (roster views, admin, login)
  src/components/    → React components
  src/lib/           → Supabase client, generated database.types.ts, helpers
  src/lib/__tests__/ → Vitest unit tests
SPEC.md              → This file
church-duty-management-prd.md → Product source of truth
```

## Code Style

TypeScript strict everywhere; no `any` without a comment justifying it. Database is the authority: frontend and bot call Postgres functions via `supabase.rpc()` for all state changes — never raw inserts/updates on assignment tables from the client.

```typescript
// Naming: camelCase TS, snake_case SQL/DB columns. Types from generated database.types.ts.
export async function assignMember(
  supabase: SupabaseClient<Database>,
  params: { dutySlotId: string; userId: string; allowConflict?: boolean },
): Promise<AssignmentResult> {
  const { data, error } = await supabase.rpc('assign_member', {
    p_duty_slot_id: params.dutySlotId,
    p_user_id: params.userId,
    p_allow_conflict: params.allowConflict ?? false,
  });
  if (error) throw new AssignmentError(error.message);
  return data;
}
```

SQL conventions:
- Every state-changing operation is a `security definer` Postgres function (`assign_member`, `confirm_assignment`, `publish_roster`, …) that internally calls the single `check_conflicts(user_id, date, tstzrange)` function
- RLS policies named `<table>_<action>_<role>` (e.g., `duty_slots_insert_head`); one migration file per logical unit
- Migrations are append-only once merged; fix-forward with new migrations

## Testing Strategy

Pragmatic tier (agreed): test the logic where a bug is invisible until it hurts.

- **pgTAP** (`supabase/tests/`, run with `supabase test db`):
  - Conflict function: overlap detected across ministries, buffer applied when end time null, override sets `conflict_acknowledged`, no false positive on adjacent slots
  - RLS: each role in PRD §4 matrix — member cannot assign, IC limited to own team, head limited to own ministry, pastor global; unauthenticated sees nothing
- **Vitest** (`web/src/lib/__tests__/` and colocated in `supabase/functions/`):
  - Telegram Login HMAC verification (valid, tampered, expired payloads)
  - Bot update parsing / handler routing (mock Telegram payloads, mock Supabase)
- **Manual verification** for dashboard UI flows and live bot interaction (real Telegram test bot against local stack)
- No browser e2e in v1

Definition of done for any task: its tests pass, `npm run typecheck` and `npm run lint` clean, `supabase db reset` succeeds from scratch.

## Boundaries

- **Always:**
  - Route every assignment/confirm/publish through Postgres functions so RLS + conflict checks apply identically from web and bot
  - Run `supabase test db` after touching any migration, policy, or SQL function
  - Validate Telegram's `secret_token` header in the webhook function; verify Login Widget HMAC before minting sessions
  - Regenerate `database.types.ts` after schema changes
  - Keep the bot webhook fast: write to DB and acknowledge; sends go through the queue
- **Ask first:**
  - Deviating from the PRD (features, permissions matrix, data model)
  - Adding dependencies beyond the agreed stack
  - Deciding any remaining PRD §9 open question not resolved above
  - Editing an already-applied migration instead of adding a new one
- **Never:**
  - Duplicate conflict logic in frontend or bot code
  - Bypass RLS with the service-role key in user-facing paths (service role is for the notification sender and auth minting only)
  - Commit bot tokens or Supabase keys (use `supabase/.env.local`, Vercel env vars, Supabase secrets)
  - Special-case Service Direction — it is a regular ministry row

## Success Criteria (Phase 1 done when)

1. A pastor can create a ministry, invite a member via deep link, and the member's Telegram is linked after `/start <token>`
2. A head can create duty slots and assign members; assigning someone already booked at an overlapping time (any ministry) is blocked with the conflict shown, and can proceed only via explicit override which flags ⚠️ on roster views
3. Publishing a roster sends Telegram notifications with a working ✅ Confirm button that updates assignment status
4. `/duties` returns the member's upcoming assignments; `/roster` shows their ministries' published rosters
5. Day-before reminders arrive automatically via the pg_cron pipeline (verifiable locally with a shortened schedule)
6. All users can log in to the dashboard via Telegram and view the full-year published roster; permissions matrix holds (verified by pgTAP RLS tests)
7. `supabase db reset` + seed produces a working local environment; all pgTAP and Vitest suites pass

## Open Questions

- Roster visibility nuance (PRD §9 Q2) — PRD §3.8 already grants all logged-in users the full-year published roster, so treating as resolved; flag if a privacy concern emerges during pilot
- Data retention (PRD §9 Q6) — no purging in MVP; decide before storage becomes material
- Service order formats (PRD §9 Q8) — Phase 2 concern
