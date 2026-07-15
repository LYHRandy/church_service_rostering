import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Update, UserFromGetMe } from 'grammy/types';
import { createBot } from './bot';
import type { BotDb } from '../_shared/db';

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'TestBot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as UserFromGetMe;

const CHAT = { id: 100, type: 'private' as const, first_name: 'Joel' };
const GROUP_CHAT = { id: -200, type: 'group' as const, title: 'Worship Team' };
const FROM = { id: 555, is_bot: false, first_name: 'Joel' };

function commandUpdate(
  text: string,
  updateId = 1,
  chat: NonNullable<Update['message']>['chat'] = CHAT,
): Update {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1700000000,
      chat,
      from: FROM,
      text,
      entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }],
    },
  };
}

function callbackUpdate(data: string, updateId = 1): Update {
  return {
    update_id: updateId,
    callback_query: {
      id: 'cb1',
      from: FROM,
      chat_instance: 'ci1',
      data,
      message: {
        message_id: 42,
        date: 1700000000,
        chat: CHAT,
        text: 'You have been assigned',
      },
    },
  };
}

function fakeDb(overrides: Partial<BotDb> = {}): BotDb {
  return {
    linkTelegram: vi.fn().mockResolvedValue({ ok: true, name: 'Grace Ho' }),
    getDuties: vi.fn().mockResolvedValue({ linked: true, duties: [] }),
    getRoster: vi.fn().mockResolvedValue({ linked: true, entries: [] }),
    confirmByTelegram: vi.fn().mockResolvedValue({ ok: true }),
    mintLoginToken: vi.fn().mockResolvedValue({ ok: true, tokenHash: 'hash-abc', name: 'Grace Ho' }),
    ...overrides,
  };
}

type ApiCall = { method: string; payload: Record<string, unknown> };

function instrument(db: BotDb) {
  const bot = createBot({
    token: 'test-token',
    botInfo: BOT_INFO,
    db,
    tz: 'Asia/Singapore',
    dashboardUrl: 'https://dash.example.com',
  });
  const calls: ApiCall[] = [];
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return Promise.resolve({ ok: true as const, result: true as never });
  });
  return { bot, calls };
}

describe('/start', () => {
  it('links a valid invite token and greets by profile name', async () => {
    const db = fakeDb();
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(commandUpdate('/start 50000000-0000-4000-8000-000000000001'));

    expect(db.linkTelegram).toHaveBeenCalledWith('50000000-0000-4000-8000-000000000001', 555);
    const sent = calls.find((c) => c.method === 'sendMessage');
    expect(sent?.payload.text).toContain('Grace Ho');
  });

  it('reports invalid or expired tokens', async () => {
    const db = fakeDb({
      linkTelegram: vi.fn().mockResolvedValue({ ok: false, code: 'invalid_token' }),
    });
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(commandUpdate('/start bad-token'));

    const sent = calls.find((c) => c.method === 'sendMessage');
    expect(String(sent?.payload.text)).toMatch(/invalid or expired/i);
  });

  it('explains how to get an invite when started without a token', async () => {
    const db = fakeDb();
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(commandUpdate('/start'));

    expect(db.linkTelegram).not.toHaveBeenCalled();
    const sent = calls.find((c) => c.method === 'sendMessage');
    expect(String(sent?.payload.text)).toMatch(/invite/i);
  });
});

describe('/duties', () => {
  it('prompts unlinked users to use their invite link', async () => {
    const db = fakeDb({ getDuties: vi.fn().mockResolvedValue({ linked: false }) });
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(commandUpdate('/duties'));

    const sent = calls.find((c) => c.method === 'sendMessage');
    expect(String(sent?.payload.text)).toMatch(/invite/i);
  });

  it('lists upcoming duties for linked members', async () => {
    const db = fakeDb({
      getDuties: vi.fn().mockResolvedValue({
        linked: true,
        duties: [
          {
            serviceDate: '2026-07-19',
            ministry: 'Worship',
            position: 'vocals',
            startAt: '2026-07-19T01:00:00+00:00',
            status: 'pending',
          },
        ],
      }),
    });
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(commandUpdate('/duties'));

    expect(db.getDuties).toHaveBeenCalledWith(555);
    const sent = calls.find((c) => c.method === 'sendMessage');
    expect(sent?.payload.text).toContain('Worship');
    expect(sent?.payload.text).toContain('vocals');
  });
});

describe('/roster', () => {
  it('shows the published roster with assignee names', async () => {
    const db = fakeDb({
      getRoster: vi.fn().mockResolvedValue({
        linked: true,
        entries: [
          {
            serviceDate: '2026-07-19',
            ministry: 'Worship',
            position: 'vocals',
            startAt: '2026-07-19T01:00:00+00:00',
            names: ['Joel Wong'],
          },
        ],
      }),
    });
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(commandUpdate('/roster'));

    const sent = calls.find((c) => c.method === 'sendMessage');
    expect(sent?.payload.text).toContain('Joel Wong');
  });
});

describe('/login', () => {
  it('sends a one-time dashboard sign-in button to linked members', async () => {
    const db = fakeDb();
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(commandUpdate('/login'));

    expect(db.mintLoginToken).toHaveBeenCalledWith(555);
    const sent = calls.find((c) => c.method === 'sendMessage');
    const markup = sent?.payload.reply_markup as {
      inline_keyboard: { text: string; url: string }[][];
    };
    expect(markup.inline_keyboard[0][0].url).toBe(
      'https://dash.example.com/login?token_hash=hash-abc',
    );
  });

  it('prompts unlinked users to use their invite link', async () => {
    const db = fakeDb({
      mintLoginToken: vi.fn().mockResolvedValue({ ok: false, code: 'not_linked' }),
    });
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(commandUpdate('/login'));

    const sent = calls.find((c) => c.method === 'sendMessage');
    expect(String(sent?.payload.text)).toMatch(/invite/i);
  });

  it('never posts sign-in links in group chats', async () => {
    const db = fakeDb();
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(commandUpdate('/login', 1, GROUP_CHAT));

    expect(db.mintLoginToken).not.toHaveBeenCalled();
    expect(calls.find((c) => c.method === 'sendMessage')).toBeUndefined();
  });
});

describe('confirm button', () => {
  it('confirms the assignment and acknowledges the tap', async () => {
    const db = fakeDb();
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(callbackUpdate('confirm:abc-123'));

    expect(db.confirmByTelegram).toHaveBeenCalledWith(555, 'abc-123');
    expect(calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true);
    const edit = calls.find((c) => c.method === 'editMessageText');
    expect(String(edit?.payload.text)).toContain('✅');
  });

  it('shows an alert when confirmation is rejected', async () => {
    const db = fakeDb({
      confirmByTelegram: vi.fn().mockResolvedValue({ ok: false, code: 'not_allowed' }),
    });
    const { bot, calls } = instrument(db);
    await bot.handleUpdate(callbackUpdate('confirm:abc-123'));

    const answer = calls.find((c) => c.method === 'answerCallbackQuery');
    expect(answer?.payload.show_alert).toBe(true);
    expect(calls.find((c) => c.method === 'editMessageText')).toBeUndefined();
  });
});
