// Telegram Login Widget → Supabase session.
// The browser POSTs the widget's signed payload here. We verify the HMAC
// against the bot token (so verify_jwt is off — the payload itself is the
// credential), require the Telegram account to be linked to a member profile,
// lazily create the backing auth user, and return a one-time token_hash the
// client exchanges via supabase.auth.verifyOtp({ type: 'email', token_hash }).

import { createClient } from '@supabase/supabase-js';
import { verifyTelegramLogin } from '../_shared/telegram-login.ts';

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

  const telegramId = Number(payload.id);
  const { data: profile } = await admin
    .from('users')
    .select('id, name, auth_user_id')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (!profile) {
    return json({ error: 'not_invited' }, 403);
  }

  // Synthetic address: auth requires an email but Telegram is the identity.
  const email = `tg_${telegramId}@telegram.local`;

  if (!profile.auth_user_id) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { telegram_id: telegramId, name: profile.name },
    });
    if (createError || !created.user) {
      console.error('createUser failed:', createError?.message);
      return json({ error: 'auth_provisioning_failed' }, 500);
    }
    const { error: linkError } = await admin
      .from('users')
      .update({ auth_user_id: created.user.id })
      .eq('id', profile.id);
    if (linkError) {
      console.error('auth link failed:', linkError.message);
      return json({ error: 'auth_provisioning_failed' }, 500);
    }
  }

  const { data: link, error: linkGenError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkGenError || !link.properties?.hashed_token) {
    console.error('generateLink failed:', linkGenError?.message);
    return json({ error: 'session_mint_failed' }, 500);
  }

  return json({ token_hash: link.properties.hashed_token, name: profile.name });
});
