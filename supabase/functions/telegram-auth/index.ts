// Telegram Login Widget → Supabase session.
// The browser POSTs the widget's signed payload here. We verify the HMAC
// against the bot token (so verify_jwt is off — the payload itself is the
// credential), require the Telegram account to be linked to a member profile,
// lazily create the backing auth user, and return a one-time token_hash the
// client exchanges via supabase.auth.verifyOtp({ type: 'email', token_hash }).

import { createClient } from '@supabase/supabase-js';
import { verifyTelegramLogin } from '../_shared/telegram-login.ts';
import { mintLoginTokenHash } from '../_shared/login-token.ts';

const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
if (!botToken) {
  throw new Error('TELEGRAM_BOT_TOKEN must be set');
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let payload: Record<string, string>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const verdict = await verifyTelegramLogin(payload, botToken);
  if (!verdict.ok) {
    return json({ error: 'verification_failed', reason: verdict.reason }, 401);
  }

  const minted = await mintLoginTokenHash(admin, Number(payload.id));
  if (!minted.ok) {
    return minted.code === 'not_linked'
      ? json({ error: 'not_invited' }, 403)
      : json({ error: 'session_mint_failed' }, 500);
  }

  return json({ token_hash: minted.tokenHash, name: minted.name });
});
