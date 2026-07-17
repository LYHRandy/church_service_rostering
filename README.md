# Church Duty Management System

Roster management for church ministries: a Next.js dashboard for admins, a Telegram bot for members (assignments, ✅ confirmations, day-before reminders), and cross-ministry conflict detection enforced in Postgres.

Docs: `church-duty-management-prd.md` (product) · `SPEC.md` (engineering contract) · `tasks/plan.md` + `tasks/todo.md` (build plan/progress) · `CLAUDE.md` (dev commands).

## Prerequisites

- Node 22+, Docker Desktop
- `npm install` at the repo root (installs the Supabase CLI) and in `web/`

## Local development

```bash
npx supabase start                  # local Postgres/auth/storage/edge stack
npx supabase db reset               # apply migrations + seed demo data
cp supabase/.env.local.example supabase/.env.local   # fill in (fake values fine locally)
npx supabase functions serve --env-file supabase/.env.local
cd web && npm run dev               # dashboard on http://localhost:3000
```

Tests:

```bash
npx supabase test db    # pgTAP: RLS matrix, conflict engine, RPCs, reminders (87 tests)
npm test                # root: bot handlers, queue drain, HMAC verify (28 tests)
cd web && npm test      # web unit tests
```

The seed creates three ministries (incl. Service Direction), demo users, and this Sunday's slots. Joel Wong belongs to Worship *and* Ushering with overlapping 9am duties — assigning him to the Ushering slot on `/admin/roster` demonstrates the conflict block + override flow.

Local bot testing without a real bot: `supabase/.env.local` ships a fake token plus `TELEGRAM_BOT_INFO`, so you can POST simulated updates to `http://127.0.0.1:54321/functions/v1/telegram-bot` (header `X-Telegram-Bot-Api-Secret-Token` must match `TELEGRAM_WEBHOOK_SECRET`). Replies to Telegram fail (fake token) but all DB effects are real.

## Going live (first deploy checklist)

1. **Bots**: create a production bot and a dev bot with @BotFather. For the dashboard login run `/setdomain` on each (prod domain / tunnel domain).
2. **Supabase project**: `npx supabase link`, `npx supabase db push`, `npx supabase functions deploy telegram-bot telegram-auth send-notifications`, and set secrets: `npx supabase secrets set TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… CHURCH_TZ=Asia/Singapore` (do **not** set `TELEGRAM_BOT_INFO` in production).
3. **Vault** (SQL editor, once): create secrets `project_functions_url` = `https://<ref>.supabase.co/functions/v1` and `project_service_role_key` = the **`sb_secret_…` secret key** (dashboard → Settings → API keys), so the pg_cron drain job can call the send function. Not the legacy `eyJ…` service-role JWT — edge functions compare the caller against the injected `SUPABASE_SERVICE_ROLE_KEY`, which is the new-format key on current projects, and the drain gets 403 `forbidden` on mismatch.
4. **Webhook**: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<ref>.supabase.co/functions/v1/telegram-bot&secret_token=<TELEGRAM_WEBHOOK_SECRET>`.
5. **Web**: deploy `web/` to Vercel with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_FUNCTIONS_URL`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
6. **Bootstrap data**: insert the first global-admin row (`insert into users (name, global_role) values ('…', 'admin')` — or `'pastor'`; the two are permission-equivalent), link their Telegram with an invite token, then everything else happens in the dashboard.

For local end-to-end bot testing with a real dev bot: put its token in `supabase/.env.local` (remove `TELEGRAM_BOT_INFO`), expose port 54321 with a tunnel (e.g. `cloudflared tunnel --url http://localhost:54321`), and point the dev bot's webhook + login domain at the tunnel URL.

## Architecture in one paragraph

Everything lives in Supabase. The permissions matrix is Postgres RLS (reads) plus `security definer` RPCs (all writes) — the dashboard and bot cannot bypass them. One `check_conflicts()` SQL function is the sole overlap authority, called by `assign_member` from every path; unresolved conflicts block the write unless explicitly overridden (`conflict_acknowledged`, shown as ⚠️ everywhere). Publishing and reminders write `notification_queue` rows; pg_cron drains the queue through the `send-notifications` edge function to the Telegram Bot API. Login is the Telegram Login Widget verified by HMAC in `telegram-auth`, which mints a Supabase session mapped to the member profile via `users.auth_user_id`.
