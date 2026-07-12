import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyTelegramLogin } from './telegram-login.ts';

const BOT_TOKEN = '123456:TEST-TOKEN-abcdef';
const NOW = 1_800_000_000;

// Builds a payload signed exactly the way Telegram's Login Widget signs it:
// HMAC-SHA256 over the sorted key=value lines, keyed with SHA256(bot_token).
function signedPayload(fields: Record<string, string>): Record<string, string> {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHash('sha256').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return { ...fields, hash };
}

const BASE_FIELDS = {
  id: '555001',
  first_name: 'Joel',
  username: 'joelw',
  auth_date: String(NOW - 60),
};

describe('verifyTelegramLogin', () => {
  it('accepts a correctly signed, fresh payload', async () => {
    const result = await verifyTelegramLogin(signedPayload(BASE_FIELDS), BOT_TOKEN, NOW);
    expect(result).toEqual({ ok: true });
  });

  it('rejects a payload with any tampered field', async () => {
    const payload = signedPayload(BASE_FIELDS);
    payload.id = '999999'; // attacker swaps in another telegram id
    const result = await verifyTelegramLogin(payload, BOT_TOKEN, NOW);
    expect(result).toEqual({ ok: false, reason: 'bad_hash' });
  });

  it('rejects a payload signed with a different bot token', async () => {
    const result = await verifyTelegramLogin(
      signedPayload(BASE_FIELDS),
      'another:token',
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'bad_hash' });
  });

  it('rejects a stale auth_date (older than 24h)', async () => {
    const payload = signedPayload({ ...BASE_FIELDS, auth_date: String(NOW - 86_401) });
    const result = await verifyTelegramLogin(payload, BOT_TOKEN, NOW);
    expect(result).toEqual({ ok: false, reason: 'stale' });
  });

  it('rejects a payload without a hash', async () => {
    const result = await verifyTelegramLogin({ ...BASE_FIELDS }, BOT_TOKEN, NOW);
    expect(result).toEqual({ ok: false, reason: 'missing_hash' });
  });

  it('ignores empty optional fields rather than signing over them', async () => {
    // Telegram omits fields the user has not set; the verifier must only use
    // the keys actually present.
    const minimal = signedPayload({ id: '1', first_name: 'A', auth_date: String(NOW - 5) });
    const result = await verifyTelegramLogin(minimal, BOT_TOKEN, NOW);
    expect(result).toEqual({ ok: true });
  });
});
