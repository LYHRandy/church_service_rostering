// Telegram Login Widget verification (https://core.telegram.org/widgets/login).
// Web Crypto only, so it runs under both Deno (edge) and Node (Vitest).

const MAX_AGE_SECONDS = 86_400; // 24h, per Telegram's own recommendation

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_hash' | 'bad_hash' | 'stale' };

export async function verifyTelegramLogin(
  payload: Record<string, string>,
  botToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  const { hash, ...fields } = payload;
  if (!hash) {
    return { ok: false, reason: 'missing_hash' };
  }

  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');

  const encoder = new TextEncoder();
  const secret = await crypto.subtle.digest('SHA-256', encoder.encode(botToken));
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(dataCheckString));
  const expected = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (!timingSafeEqualHex(expected, hash.toLowerCase())) {
    return { ok: false, reason: 'bad_hash' };
  }

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate) || nowSeconds - authDate > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'stale' };
  }

  return { ok: true };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
