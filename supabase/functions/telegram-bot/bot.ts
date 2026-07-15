// Bot behavior: commands and callback handlers. Runtime-agnostic — the Deno
// entrypoint (index.ts) wires this to the webhook; Vitest drives it with
// bot.handleUpdate() in Node.

import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { BotDb } from '../_shared/db.ts';
import {
  confirmError,
  confirmSuccess,
  formatDuties,
  formatRoster,
  linkError,
  linkSuccess,
  loginError,
  loginLink,
  notLinked,
  startWelcome,
} from '../_shared/messages.ts';

export function createBot(opts: {
  token: string;
  db: BotDb;
  tz: string;
  dashboardUrl: string;
  botInfo?: UserFromGetMe;
}): Bot {
  const { db, tz, dashboardUrl } = opts;
  const bot = new Bot(opts.token, opts.botInfo ? { botInfo: opts.botInfo } : undefined);

  bot.command('start', async (ctx) => {
    const token = ctx.match.trim();
    const from = ctx.from;
    if (!from) return;
    if (!token) {
      await ctx.reply(startWelcome());
      return;
    }
    const result = await db.linkTelegram(token, from.id);
    await ctx.reply(result.ok ? linkSuccess(result.name) : linkError(result.code));
  });

  bot.command('duties', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const result = await db.getDuties(from.id);
    await ctx.reply(result.linked ? formatDuties(result.duties, tz) : notLinked());
  });

  bot.command('roster', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const result = await db.getRoster(from.id);
    await ctx.reply(result.linked ? formatRoster(result.entries, tz) : notLinked());
  });

  bot.command('login', async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    // Sign-in links are personal credentials — never post one where others
    // could tap it before the sender does.
    if (ctx.chat.type !== 'private') return;

    const result = await db.mintLoginToken(from.id);
    if (!result.ok) {
      await ctx.reply(result.code === 'not_linked' ? notLinked() : loginError());
      return;
    }
    const url = `${dashboardUrl}/login?token_hash=${encodeURIComponent(result.tokenHash)}`;
    await ctx.reply(loginLink(), {
      reply_markup: { inline_keyboard: [[{ text: '🔐 Open dashboard', url }]] },
    });
  });

  bot.callbackQuery(/^confirm:(.+)$/, async (ctx) => {
    const assignmentId = ctx.match[1];
    const result = await db.confirmByTelegram(ctx.from.id, assignmentId);

    if (!result.ok) {
      await ctx.answerCallbackQuery({ text: confirmError(result.code), show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: confirmSuccess() });
    const original = ctx.callbackQuery.message?.text;
    if (original !== undefined) {
      // Replace the button with an inline confirmation so a second tap is impossible.
      await ctx.editMessageText(`${original}\n\n✅ Confirmed`);
    }
  });

  return bot;
}
