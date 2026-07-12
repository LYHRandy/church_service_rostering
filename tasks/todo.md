# Todo — Phase 1 MVP

Detail per task: `tasks/plan.md`. Order respects dependencies; B and C tracks may interleave after Checkpoint A.

## Phase A — Foundation
- [x] T1: Scaffold repo and tooling (supabase init, web/ Next.js, Vitest, scripts)
- [x] T2: Core schema migration + seed + generated types
- [x] T3: RLS policies + pgTAP permissions-matrix tests
- [x] T4: Conflict engine (`check_conflicts`) + write RPCs + pgTAP
- [x] **Checkpoint A**: db reset + `supabase test db` green (59 tests); schema/policies awaiting human review

## Phase B — Telegram bot
- [x] T5: Bot webhook skeleton + secret-token validation + `/start` linking
- [x] T6: `/duties` and `/roster` commands
- [x] T7: Publish → notification queue → send → ✅ Confirm callback (live-bot pass pending user's dev bot token)
- [x] T8: pg_cron reminder pipeline (day-before) + queue drain job
- [x] **Checkpoint B**: pipeline verified locally end-to-end (simulated updates + pg_net loop); live dev-bot pass pending user's bot token

## Phase C — Auth + dashboard
- [x] T9: `telegram-auth` edge function (HMAC verify → session) + Vitest
- [x] T10: Login page (Telegram widget) + protected app shell
- [x] T11: Full-year read-only roster views (by date/ministry/member, ⚠️ badges)
- [x] T12: Ministry + member management UI + invite link generation
- [x] T13: Duty slot creation UI (heads)
- [x] T14: Assignment UI + conflict block/override + publish
- [ ] **Checkpoint C**: scripted walkthrough done for criteria 1,2 (via pgTAP),4,6,7; criteria 3 & 5 (live Telegram sends) and widget login need the user's dev bot + tunnel — see README "Going live"
