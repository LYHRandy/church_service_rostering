// Message formatting for the Telegram bot. Pure functions — no runtime APIs —
// so they run identically under Deno (edge functions) and Node (Vitest).

export interface DutyRow {
  serviceDate: string;
  ministry: string;
  position: string;
  startAt: string;
  status: 'pending' | 'confirmed' | 'swap_requested' | 'swapped';
}

export interface RosterEntry {
  serviceDate: string;
  ministry: string;
  position: string;
  startAt: string;
  names: string[];
}

export interface NotificationPayload {
  ministry: string;
  position: string;
  service_date: string;
  start_at: string;
  [key: string]: unknown;
}

export type LinkErrorCode = 'invalid_token' | 'telegram_already_linked' | 'unknown';

const STATUS_EMOJI: Record<DutyRow['status'], string> = {
  pending: '⏳',
  confirmed: '✅',
  swap_requested: '🔄',
  swapped: '↔️',
};

function localTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(new Date(iso));
}

function dayLabel(serviceDate: string): string {
  const weekday = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${serviceDate}T00:00:00Z`));
  return `${weekday} ${serviceDate}`;
}

export function formatDuties(duties: DutyRow[], tz: string): string {
  if (duties.length === 0) {
    return 'You have no upcoming duties. 🎉';
  }
  const lines = duties.map(
    (d) =>
      `${STATUS_EMOJI[d.status]} ${dayLabel(d.serviceDate)} · ${d.ministry} — ${d.position} at ${localTime(d.startAt, tz)}`,
  );
  return ['Your upcoming duties:', '', ...lines].join('\n');
}

export function formatRoster(entries: RosterEntry[], tz: string): string {
  if (entries.length === 0) {
    return 'There is no published roster for your ministries in the next few weeks.';
  }
  const lines = entries.map(
    (e) =>
      `${dayLabel(e.serviceDate)} · ${e.ministry} — ${e.position} at ${localTime(e.startAt, tz)}: ${e.names.join(', ')}`,
  );
  return ['Published roster (next 4 weeks):', '', ...lines].join('\n');
}

export function startWelcome(): string {
  return [
    'Welcome to the church duty roster bot! 🙌',
    '',
    'To link your account, ask your ministry head for an invite link and tap it.',
    'Once linked you can use /duties and /roster here.',
  ].join('\n');
}

export function notLinked(): string {
  return 'Your Telegram is not linked yet. Ask your ministry head for an invite link and tap it to get started.';
}

export function linkSuccess(name: string): string {
  return `You're all set, ${name}! ✅\n\nYou'll receive duty notifications and reminders here.\nTry /duties to see what's coming up.`;
}

export function linkError(code: LinkErrorCode): string {
  switch (code) {
    case 'invalid_token':
      return 'That invite link is invalid or expired. Please ask your ministry head for a new one.';
    case 'telegram_already_linked':
      return 'This Telegram account is already linked to a different member. Please contact your ministry head.';
    default:
      return 'Something went wrong linking your account. Please try again or contact your ministry head.';
  }
}

export function publishedNotification(payload: NotificationPayload, tz: string): string {
  return [
    '📋 New duty assigned',
    '',
    `${payload.ministry} — ${payload.position}`,
    `${dayLabel(payload.service_date)} at ${localTime(payload.start_at, tz)}`,
    '',
    'Please confirm with the button below.',
  ].join('\n');
}

export function reminderNotification(payload: NotificationPayload, tz: string): string {
  return [
    '⏰ Duty reminder — you serve tomorrow!',
    '',
    `${payload.ministry} — ${payload.position}`,
    `${dayLabel(payload.service_date)} at ${localTime(payload.start_at, tz)}`,
  ].join('\n');
}

export function confirmSuccess(): string {
  return 'Confirmed — thank you! ✅';
}

export function confirmError(code: string): string {
  switch (code) {
    case 'not_allowed':
      return 'This assignment belongs to someone else.';
    case 'assignment_not_found':
      return 'This assignment no longer exists.';
    case 'telegram_not_linked':
      return 'Your Telegram is not linked. Use your invite link first.';
    default:
      return 'Could not confirm. Please try again.';
  }
}
