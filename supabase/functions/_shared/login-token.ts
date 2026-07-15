// One-time dashboard sign-in tokens minted from a linked Telegram account.
// Shared by telegram-auth (Login Widget flow) and the bot's /login command so
// auth-user provisioning and token minting live in exactly one place.

import type { SupabaseClient } from '@supabase/supabase-js';

export type MintResult =
  | { ok: true; tokenHash: string; name: string }
  | { ok: false; code: 'not_linked' | 'mint_failed' };

export async function mintLoginTokenHash(
  admin: SupabaseClient,
  telegramId: number,
): Promise<MintResult> {
  const { data: profile } = await admin
    .from('users')
    .select('id, name, auth_user_id')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (!profile) {
    return { ok: false, code: 'not_linked' };
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
      return { ok: false, code: 'mint_failed' };
    }
    const { error: linkError } = await admin
      .from('users')
      .update({ auth_user_id: created.user.id })
      .eq('id', profile.id);
    if (linkError) {
      console.error('auth link failed:', linkError.message);
      return { ok: false, code: 'mint_failed' };
    }
  }

  const { data: link, error: linkGenError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkGenError || !link.properties?.hashed_token) {
    console.error('generateLink failed:', linkGenError?.message);
    return { ok: false, code: 'mint_failed' };
  }

  return { ok: true, tokenHash: link.properties.hashed_token, name: profile.name };
}
