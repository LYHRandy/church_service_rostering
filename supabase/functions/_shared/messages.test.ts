import { describe, expect, it } from 'vitest';
import {
  formatDuties,
  formatRoster,
  linkError,
  notLinked,
  publishedNotification,
  reminderNotification,
  startWelcome,
} from './messages';

const TZ = 'Asia/Singapore';

describe('formatDuties', () => {
  it('tells the member when nothing is upcoming', () => {
    expect(formatDuties([], TZ)).toMatch(/no upcoming duties/i);
  });

  it('lists ministry, position, local time, and confirmation status', () => {
    const text = formatDuties(
      [
        {
          serviceDate: '2026-07-19',
          ministry: 'Worship',
          position: 'vocals',
          startAt: '2026-07-19T01:00:00+00:00', // 09:00 in Singapore
          status: 'pending',
        },
        {
          serviceDate: '2026-07-19',
          ministry: 'Ushering',
          position: 'usher',
          startAt: '2026-07-19T01:00:00+00:00',
          status: 'confirmed',
        },
      ],
      TZ,
    );
    expect(text).toContain('Worship');
    expect(text).toContain('vocals');
    expect(text).toContain('09:00');
    expect(text).toContain('⏳'); // pending
    expect(text).toContain('✅'); // confirmed
  });
});

describe('formatRoster', () => {
  it('tells the member when no roster is published', () => {
    expect(formatRoster([], TZ)).toMatch(/no published roster/i);
  });

  it('shows slot and assignee names', () => {
    const text = formatRoster(
      [
        {
          serviceDate: '2026-07-19',
          ministry: 'Worship',
          position: 'vocals',
          startAt: '2026-07-19T01:00:00+00:00',
          names: ['Joel Wong', 'Grace Ho'],
        },
      ],
      TZ,
    );
    expect(text).toContain('Worship');
    expect(text).toContain('Joel Wong, Grace Ho');
  });
});

describe('link/start messages', () => {
  it('maps invalid_token to a friendly message', () => {
    expect(linkError('invalid_token')).toMatch(/invalid or expired/i);
  });

  it('maps telegram_already_linked to a friendly message', () => {
    expect(linkError('telegram_already_linked')).toMatch(/already linked/i);
  });

  it('welcome without a token explains how to get an invite', () => {
    expect(startWelcome()).toMatch(/invite/i);
  });

  it('unlinked users are told to use their invite link', () => {
    expect(notLinked()).toMatch(/invite/i);
  });
});

describe('notifications', () => {
  it('published notification names the duty and asks to confirm', () => {
    const text = publishedNotification(
      { ministry: 'Worship', position: 'vocals', service_date: '2026-07-19', start_at: '2026-07-19T01:00:00+00:00' },
      TZ,
    );
    expect(text).toContain('Worship');
    expect(text).toContain('vocals');
    expect(text).toContain('2026-07-19');
    expect(text).toContain('09:00');
  });

  it('reminder notification says the duty is tomorrow', () => {
    const text = reminderNotification(
      { ministry: 'Worship', position: 'vocals', service_date: '2026-07-19', start_at: '2026-07-19T01:00:00+00:00' },
      TZ,
    );
    expect(text).toMatch(/tomorrow/i);
    expect(text).toContain('09:00');
  });
});
