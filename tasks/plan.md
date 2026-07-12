# Implementation Plan: Church Duty Management — Phase 1 MVP

Source: `SPEC.md` (engineering contract) and `church-duty-management-prd.md` (product truth).
Greenfield repo — no existing code constraints.

## Overview

Build the MVP bottom-up from the database (schema → RLS → conflict engine), then two tracks that both sit on that foundation: the Telegram bot pipeline and the auth + dashboard. Every state change is a Postgres function; the database work is therefore the riskiest and comes first.

## Architecture Decisions

- **`users.auth_user_id` maps to `auth.users.id`** (revised during T2): member profiles are created by admins *before* any Telegram link exists, so `users.id` cannot equal `auth.users.id` at creation time. Instead `users` carries a nullable unique `auth_user_id`; the `telegram-auth`/link edge functions create the auth user (service role) and set the mapping. RLS resolves identity via a `security definer` helper `app_user_id()` = the `users.id` whose `auth_user_id = auth.uid()`.
- **RLS reads, RPC writes**: SELECT access via RLS policies; all writes on roster tables via `security definer` functions (`assign_member`, `confirm_assignment`, `publish_roster`, `link_telegram_account`, `create_invite`). Clients never INSERT/UPDATE assignment rows.
- **One conflict function**: `check_conflicts(user_id, service_date, tstzrange)` called inside `assign_member`; 2h default buffer from `app_config` when a slot has no end time.
- **Queue-first notifications**: nothing sends synchronously. DB events write `notification_queue` rows; pg_cron invokes `send-notifications` via pg_net; the bot webhook only writes + acks.
- **Dev bot ≠ prod bot**: separate BotFather bots for local dev and production, since webhook URL and login-widget domain are per-bot.

## Dependency Graph

```
T1 Scaffold
 └─ T2 Schema + seed
     ├─ T3 RLS policies + pgTAP matrix tests
     └─ T4 Conflict function + write RPCs + pgTAP
         ├─ T5 Bot webhook + /start linking ── T6 /duties, /roster
         │    └─ T7 Publish → queue → send → Confirm button
         │         └─ T8 pg_cron reminders + queue drain
         └─ T9 telegram-auth (HMAC → session)
              └─ T10 Login page + protected layout
                   └─ T11 Roster views ── T12 Member/ministry admin UI
                        └─ T13 Slot creation UI ── T14 Assignment UI + publish
```

After T4, the bot track (T5–T8) and the web track (T9–T14) are independent and can be parallelized.

---

## Phase A — Foundation

### Task 1: Scaffold repo and tooling

**Description:** Initialize the two-part workspace: `supabase/` via Supabase CLI and `web/` via create-next-app (TypeScript strict, Tailwind, ESLint). Add Vitest, `typecheck` script, `.gitignore`, `supabase/.env.local.example`. Update CLAUDE.md Commands section.

**Acceptance criteria:**
- [ ] `supabase start` boots the local stack; `npm run dev` serves the dashboard shell
- [ ] `npm test`, `npm run lint`, `npm run typecheck` all run clean (empty/placeholder test ok)
- [ ] No secrets in git; `.env.local.example` documents required vars (bot token, webhook secret)

**Verification:** run the five commands above; `git status` shows no env files.
**Dependencies:** None. **Files:** ~scaffold (generated). **Scope:** M

### Task 2: Core schema migration + seed

**Description:** First migration: enums (`global_role`, `ministry_role`, `assignment_status`), tables `users`, `ministries`, `memberships`, `duty_slots`, `assignments`, `invite_tokens`, `notification_queue`, `app_config` (holds `default_duty_buffer = 2h`, `reminder_morning_of = false`), indexes, FKs. `seed.sql` with 2 ministries (incl. Service Direction as a plain row), ~6 users, slots across dates. Generate `database.types.ts`.

**Acceptance criteria:**
- [ ] `supabase db reset` replays migration + seed without error
- [ ] Schema matches PRD §5 for MVP tables (deferred tables not created)
- [ ] `supabase gen types` output committed and imports cleanly in `web/`

**Verification:** `supabase db reset`; `npm run typecheck`.
**Dependencies:** T1. **Files:** 1 migration, seed.sql, database.types.ts. **Scope:** M

### Task 3: RLS policies + pgTAP permissions tests

**Description:** Enable RLS on all tables; write read policies (any authenticated user sees published rosters + own assignments; heads/ICs see their ministry's drafts; pastors/staff see all) and deny-by-default writes. Set up pgTAP harness with helper to impersonate users; encode the PRD §4 matrix rows that apply to MVP as tests.

**Acceptance criteria:**
- [ ] Every table has RLS enabled; anon sees nothing
- [ ] pgTAP asserts: member can't read drafts or write anything; head scoped to own ministry; pastor global
- [ ] `supabase test db` green

**Verification:** `supabase test db`; manual psql spot-check as two roles.
**Dependencies:** T2. **Files:** 1 migration, 2–3 test files. **Scope:** M

### Task 4: Conflict engine + write RPCs

**Description:** `check_conflicts(p_user_id, p_range tstzrange)` applying the `app_config` buffer when a slot lacks an end time. `security definer` RPCs: `assign_member` (blocks on conflict unless `p_allow_conflict`, then sets `conflict_acknowledged`), `confirm_assignment`, `publish_roster` (draft→published, enqueues notifications), `create_invite`, `link_telegram_account`. Each RPC re-checks the caller's permission internally (defense in depth over RLS).

**Acceptance criteria:**
- [ ] pgTAP: overlap across different ministries blocked; adjacent (non-overlapping) slots allowed; null end time uses 2h buffer; override records `conflict_acknowledged = true`
- [ ] RPCs reject callers lacking matrix permission (member calling `assign_member` fails)
- [ ] `publish_roster` writes one `notification_queue` row per affected assignee

**Verification:** `supabase test db`.
**Dependencies:** T3. **Files:** 1–2 migrations, 2 test files. **Scope:** M

### Checkpoint A (after T4)
- [ ] Fresh `supabase db reset` + full `supabase test db` green
- [ ] Human review of schema + policy SQL before anything builds on it

---

## Phase B — Telegram bot (parallel with Phase C after Checkpoint A)

### Task 5: Bot webhook + /start linking

**Description:** `telegram-bot` edge function with grammY: validate `X-Telegram-Bot-Api-Secret-Token`, handle `/start <token>` → `link_telegram_account` RPC → welcome or error reply. `_shared/` module for Supabase client + types. Local run via `supabase functions serve`.

**Acceptance criteria:**
- [ ] Requests missing/wrong secret token get 401 and are not processed
- [ ] Valid invite token links `telegram_id` to the right user exactly once; reuse/expired tokens rejected with a friendly message
- [ ] Handler acks within the request; no outbound sends besides the direct reply

**Verification:** Vitest handler tests with mock updates; manual: curl a forged update (rejected), real `/start` against dev bot linked via tunnel.
**Dependencies:** T4. **Files:** 3–4 function files, 1 test file. **Scope:** M

### Task 6: /duties and /roster commands

**Description:** `/duties` lists the member's upcoming confirmed/pending assignments (date, ministry, position, status emoji). `/roster` lists published rosters for the member's ministries, next 4 weeks. Read via the user's identity (RPC or scoped query), formatted as Telegram HTML.

**Acceptance criteria:**
- [ ] `/duties` for unlinked chat prompts to use invite link; linked member sees own upcoming duties only
- [ ] `/roster` shows only published (never draft) slots for the member's ministries

**Verification:** Vitest with seeded fixtures; manual against dev bot.
**Dependencies:** T5. **Files:** 2 handler files, tests. **Scope:** S

### Task 7: Publish → notify → Confirm flow

**Description:** `send-notifications` edge function: drains due `notification_queue` rows (batch, marks `sent_at`, retries left for later), sends "you've been assigned" messages with ✅ Confirm inline button. Callback-query handler in `telegram-bot` calls `confirm_assignment` and edits the message to show confirmed state.

**Acceptance criteria:**
- [ ] `publish_roster` → invoking `send-notifications` delivers one message per assignee, queue rows marked sent (no double-send on re-invoke)
- [ ] Tapping Confirm sets `assignments.status = 'confirmed'` and updates the message; tapping twice is idempotent

**Verification:** Vitest for queue-drain logic (mock Bot API); manual end-to-end with dev bot.
**Dependencies:** T5. **Files:** ~4 files + tests. **Scope:** M

### Task 8: pg_cron reminder pipeline

**Description:** Migration adding pg_cron + pg_net jobs: (a) every few minutes, invoke `send-notifications` via pg_net if queue has due rows; (b) daily job enqueuing day-before reminders for confirmed/pending assignments. Reminder timing read from `app_config`.

**Acceptance criteria:**
- [ ] Cron jobs created by migration and visible in `cron.job`
- [ ] Day-before job enqueues exactly one reminder per assignment (idempotent across reruns)
- [ ] With a shortened local schedule, a seeded next-day duty produces a Telegram reminder without manual invocation

**Verification:** pgTAP for enqueue idempotency; manual local run with 1-minute schedule.
**Dependencies:** T7. **Files:** 1–2 migrations, 1 test. **Scope:** S–M

### Checkpoint B (after T8)
- [ ] Live run-through on dev bot: invite → link → publish → notification → confirm → next-day reminder (compressed schedule)
- [ ] SPEC success criteria 1 (linking), 3 (confirm), 4 (commands), 5 (reminders) demonstrably met

---

## Phase C — Auth + dashboard

### Task 9: telegram-auth edge function

**Description:** Verify Telegram Login Widget payload (HMAC-SHA256 against bot token, reject stale `auth_date` > 24h), upsert auth user by `telegram_id` (service role), return Supabase session tokens.

**Acceptance criteria:**
- [ ] Vitest: valid payload passes; tampered field fails; stale `auth_date` fails
- [ ] Login as a linked member yields a session whose `auth.uid()` matches their `users.id`
- [ ] Unlinked Telegram accounts get a clear "ask your admin for an invite" error

**Verification:** `npm test`; manual curl with a captured widget payload.
**Dependencies:** T4. **Files:** 2–3 function files + tests. **Scope:** M

### Task 10: Login page + protected app shell

**Description:** `/login` renders the Telegram Login Widget (dev bot in dev); on callback, exchange payload via `telegram-auth`, store session with Supabase SSR helpers, redirect. Authenticated layout with nav + role-aware links; middleware redirects logged-out users to `/login`.

**Acceptance criteria:**
- [ ] Full widget → session → dashboard flow works over the dev tunnel domain
- [ ] Logged-out access to any app page redirects to `/login`; logout clears session

**Verification:** manual browser flow; `npm run typecheck && npm run lint`.
**Dependencies:** T9. **Files:** ~5 files. **Scope:** M

### Task 11: Full-year roster views

**Description:** Read-only published-roster views for all logged-in users: by service date (default), by ministry, by member; year selector and filters. ⚠️ badge on `conflict_acknowledged` assignments. Server components querying via RLS-scoped client.

**Acceptance criteria:**
- [ ] Any member sees all published rosters for the calendar year, filterable by ministry/date/member
- [ ] Draft slots invisible to members; conflict-overridden assignments show ⚠️

**Verification:** manual with two seeded roles; typecheck/lint.
**Dependencies:** T10. **Files:** ~5 files. **Scope:** M

### Task 12: Ministry + member management UI

**Description:** Pastor: create/archive ministries, appoint heads. Head/Pastor: add members with role + positions, generate invite deep links (`t.me/<bot>?start=<token>`) with copy button showing link status (pending/used).

**Acceptance criteria:**
- [ ] Pastor can create a ministry and appoint a head; head sees management UI only for their ministry (RLS-enforced, not just hidden nav)
- [ ] Generated invite link works end-to-end with the bot from T5

**Verification:** manual two-role walkthrough; invite link round-trip.
**Dependencies:** T10 (+T5 for round-trip). **Files:** ~5 files. **Scope:** M

### Task 13: Duty slot creation UI

**Description:** Heads create duty slots for their ministry: service date, start/end (end optional → buffer note shown), position, headcount. List upcoming slots with fill status (n of headcount assigned) and draft/published state.

**Acceptance criteria:**
- [ ] Head can create/edit/delete draft slots in own ministry only; pastor in any
- [ ] Slot list shows fill status and publish state accurately

**Verification:** manual as head + pastor; typecheck/lint.
**Dependencies:** T11. **Files:** ~4 files. **Scope:** S–M

### Task 14: Assignment UI + conflict override + publish

**Description:** Click-to-assign members (filtered by ministry membership + position) onto slots via `assign_member` RPC. On conflict: blocking dialog showing the clashing duty with explicit "Allow conflict" override. Publish button calls `publish_roster` and confirms notification count.

**Acceptance criteria:**
- [ ] Assigning a member already booked at an overlapping time (any ministry) is blocked with the conflict displayed; override proceeds and shows ⚠️ everywhere
- [ ] Publish triggers real Telegram notifications (queue path from T7)
- [ ] SPEC success criterion 2 fully demonstrated

**Verification:** manual conflict scenario from seed data; end-to-end publish → phone notification.
**Dependencies:** T13 (+T7 for publish round-trip). **Files:** ~5 files. **Scope:** M

### Checkpoint C — MVP complete
- [ ] All seven SPEC success criteria pass in a single scripted walkthrough
- [ ] `supabase db reset` from scratch + `supabase test db` + `npm test` + lint + typecheck all green
- [ ] Human review; decide go/no-go for pilot ministry deployment

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Telegram Login Widget requires a public HTTPS domain registered with BotFather — painful for local dev | High | Dedicated dev bot + tunnel (e.g. cloudflared/ngrok) set up in T1; domain set via `/setdomain`. Surface early in T9/T10, not at deploy time |
| pg_cron/pg_net behavior differs between local CLI stack and hosted Supabase | Med | Keep cron jobs trivial (invoke edge function); verify on a free hosted project during T8 |
| RLS policy complexity → recursion or accidental data exposure | High | Deny-by-default; small `security definer` helper predicates; pgTAP matrix tests in T3 are the gate |
| Bot webhook slowness → Telegram retries → duplicate processing | Med | Ack-fast pattern (T5); idempotent handlers (confirm twice = no-op, T7) |
| Windows local dev friction (Docker Desktop for `supabase start`) | Low | Verified in T1 before anything depends on it |

## Open Questions

- None blocking — SPEC.md resolved the PRD §9 questions that affect MVP. Hosted-project verification (T8 risk) may surface pg_cron plan limits; flag if so.
