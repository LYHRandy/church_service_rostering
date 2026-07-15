// Telegram webhook entrypoint (Deno). verify_jwt is disabled for this
// function (Telegram cannot send Supabase JWTs); authenticity is enforced by
// grammY's secretToken check against TELEGRAM_WEBHOOK_SECRET — forged updates
// get 401. Keep this handler fast: DB writes + acknowledge; bulk sends happen
// in send-notifications via the queue.

import { webhookCallback } from 'grammy';
import { createClient } from '@supabase/supabase-js';
import { createBot } from './bot.ts';
import { makeBotDb } from '../_shared/db.ts';

const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
if (!botToken || !webhookSecret) {
  throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set');
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Local dev: TELEGRAM_BOT_INFO skips the getMe network call so a fake token
// works against the local stack. Unset in production (grammY fetches it).
const botInfoJson = Deno.env.get('TELEGRAM_BOT_INFO');

const bot = createBot({
  token: botToken,
  db: makeBotDb(supabase),
  tz: Deno.env.get('CHURCH_TZ') ?? 'Asia/Singapore',
  // Where /login sign-in buttons point; local default matches `npm run dev`.
  dashboardUrl: Deno.env.get('DASHBOARD_URL') ?? 'http://localhost:3000',
  botInfo: botInfoJson ? JSON.parse(botInfoJson) : undefined,
});

const handleUpdate = webhookCallback(bot, 'std/http', { secretToken: webhookSecret });

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  try {
    return await handleUpdate(req);
  } catch (err) {
    // Never let Telegram retry-storm us over a handler bug; log and ack.
    console.error('telegram-bot error:', err);
    return new Response('ok');
  }
});
