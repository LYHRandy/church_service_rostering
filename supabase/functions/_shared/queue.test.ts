import { describe, expect, it, vi } from 'vitest';
import { processQueue, type QueueRow } from './queue';

function row(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 1,
    type: 'published',
    telegramId: 555,
    payload: {
      assignment_id: 'a1',
      ministry: 'Worship',
      position: 'vocals',
      service_date: '2026-07-19',
      start_at: '2026-07-19T01:00:00+00:00',
    },
    ...overrides,
  };
}

describe('processQueue', () => {
  it('sends due notifications and marks them sent', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const markSent = vi.fn().mockResolvedValue(undefined);
    const result = await processQueue({ rows: [row()], send, markSent, tz: 'Asia/Singapore' });

    expect(send).toHaveBeenCalledOnce();
    expect(markSent).toHaveBeenCalledWith(1);
    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
  });

  it('marks rows for members without Telegram as sent without sending', async () => {
    const send = vi.fn();
    const markSent = vi.fn().mockResolvedValue(undefined);
    const result = await processQueue({
      rows: [row({ telegramId: null })],
      send,
      markSent,
      tz: 'Asia/Singapore',
    });

    expect(send).not.toHaveBeenCalled();
    expect(markSent).toHaveBeenCalledWith(1);
    expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  it('leaves failed sends unmarked so the next run retries them', async () => {
    const send = vi.fn().mockRejectedValue(new Error('telegram down'));
    const markSent = vi.fn();
    const result = await processQueue({ rows: [row()], send, markSent, tz: 'Asia/Singapore' });

    expect(markSent).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, skipped: 0, failed: 1 });
  });

  it('published rows carry a confirm button; reminders do not', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const markSent = vi.fn().mockResolvedValue(undefined);
    await processQueue({
      rows: [row(), row({ id: 2, type: 'reminder' })],
      send,
      markSent,
      tz: 'Asia/Singapore',
    });

    const first = send.mock.calls[0][0];
    const second = send.mock.calls[1][0];
    expect(first.replyMarkup).toBeDefined();
    expect(first.replyMarkup?.inline_keyboard[0][0].callback_data).toBe('confirm:a1');
    expect(second.replyMarkup).toBeUndefined();
  });
});
