// Notification queue draining logic, kept pure for unit testing.
// The send-notifications entrypoint supplies the row fetch, the Telegram
// send, and the mark-sent persistence.

import {
  publishedNotification,
  reminderNotification,
  type NotificationPayload,
} from './messages.ts';

export interface QueueRow {
  id: number;
  type: 'published' | 'reminder';
  telegramId: number | null;
  payload: NotificationPayload;
}

export interface OutboundMessage {
  telegramId: number;
  text: string;
  replyMarkup?: {
    inline_keyboard: { text: string; callback_data: string }[][];
  };
}

export interface ProcessResult {
  sent: number;
  skipped: number;
  failed: number;
}

export function buildMessage(row: QueueRow, tz: string): OutboundMessage {
  if (row.telegramId === null) {
    throw new Error('buildMessage requires a telegramId');
  }
  if (row.type === 'published') {
    return {
      telegramId: row.telegramId,
      text: publishedNotification(row.payload, tz),
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ Confirm', callback_data: `confirm:${row.payload.assignment_id}` }],
        ],
      },
    };
  }
  return {
    telegramId: row.telegramId,
    text: reminderNotification(row.payload, tz),
  };
}

export async function processQueue(opts: {
  rows: QueueRow[];
  send: (message: OutboundMessage) => Promise<void>;
  markSent: (id: number) => Promise<void>;
  tz: string;
}): Promise<ProcessResult> {
  const result: ProcessResult = { sent: 0, skipped: 0, failed: 0 };

  for (const row of opts.rows) {
    // A member without Telegram can never receive this; mark it handled so the
    // queue doesn't clog (v1 decision: Telegram is required, heads coordinate
    // manually with anyone who lacks it).
    if (row.telegramId === null) {
      await opts.markSent(row.id);
      result.skipped += 1;
      continue;
    }
    try {
      await opts.send(buildMessage(row, opts.tz));
      await opts.markSent(row.id);
      result.sent += 1;
    } catch {
      // Leave unmarked; the next cron run retries.
      result.failed += 1;
    }
  }

  return result;
}
