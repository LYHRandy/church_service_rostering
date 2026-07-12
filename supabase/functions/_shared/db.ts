// Data access for the bot, wrapping RPCs and service-role reads.
// The BotDb interface is what handlers depend on; makeBotDb is the production
// implementation used by the edge function entrypoints.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DutyRow, LinkErrorCode, RosterEntry } from './messages.ts';

export interface BotDb {
  linkTelegram(
    token: string,
    telegramId: number,
  ): Promise<{ ok: true; name: string } | { ok: false; code: LinkErrorCode }>;
  getDuties(telegramId: number): Promise<{ linked: false } | { linked: true; duties: DutyRow[] }>;
  getRoster(telegramId: number): Promise<{ linked: false } | { linked: true; entries: RosterEntry[] }>;
  confirmByTelegram(
    telegramId: number,
    assignmentId: string,
  ): Promise<{ ok: true } | { ok: false; code: string }>;
}

interface SlotRow {
  service_date: string;
  start_at: string;
  position: string;
  ministries: { name: string } | null;
}

function errorCode(message: string): string {
  // RPC validation errors carry a stable token as the whole message.
  const known = ['invalid_token', 'telegram_already_linked', 'not_allowed', 'assignment_not_found', 'telegram_not_linked'];
  return known.find((k) => message.includes(k)) ?? 'unknown';
}

export function makeBotDb(client: SupabaseClient): BotDb {
  async function userIdFor(telegramId: number): Promise<string | null> {
    const { data } = await client
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle();
    return data?.id ?? null;
  }

  return {
    async linkTelegram(token, telegramId) {
      const { data, error } = await client.rpc('link_telegram_account', {
        p_token: token,
        p_telegram_id: telegramId,
      });
      if (error) {
        return { ok: false, code: errorCode(error.message) as LinkErrorCode };
      }
      return { ok: true, name: (data as { name: string }).name };
    },

    async getDuties(telegramId) {
      const userId = await userIdFor(telegramId);
      if (!userId) return { linked: false };

      const { data, error } = await client
        .from('assignments')
        .select(
          'status, duty_slots!inner(service_date, start_at, position, status, ministries(name))',
        )
        .eq('user_id', userId)
        .in('status', ['pending', 'confirmed'])
        .eq('duty_slots.status', 'published')
        .gte('duty_slots.start_at', new Date().toISOString())
        .order('start_at', { referencedTable: 'duty_slots', ascending: true });
      if (error) throw new Error(error.message);

      const duties: DutyRow[] = (data ?? []).map((a) => {
        const slot = a.duty_slots as unknown as SlotRow;
        return {
          serviceDate: slot.service_date,
          ministry: slot.ministries?.name ?? '',
          position: slot.position,
          startAt: slot.start_at,
          status: a.status as DutyRow['status'],
        };
      });
      return { linked: true, duties };
    },

    async getRoster(telegramId) {
      const userId = await userIdFor(telegramId);
      if (!userId) return { linked: false };

      const { data: memberships } = await client
        .from('memberships')
        .select('ministry_id')
        .eq('user_id', userId);
      const ministryIds = (memberships ?? []).map((m) => m.ministry_id);
      if (ministryIds.length === 0) return { linked: true, entries: [] };

      const until = new Date(Date.now() + 28 * 24 * 3600 * 1000).toISOString();
      const { data, error } = await client
        .from('duty_slots')
        .select(
          'service_date, start_at, position, ministries(name), assignments(status, users(name))',
        )
        .in('ministry_id', ministryIds)
        .eq('status', 'published')
        .gte('start_at', new Date().toISOString())
        .lte('start_at', until)
        .order('start_at', { ascending: true });
      if (error) throw new Error(error.message);

      const entries: RosterEntry[] = (data ?? []).map((slot) => ({
        serviceDate: slot.service_date as string,
        ministry: (slot.ministries as unknown as { name: string } | null)?.name ?? '',
        position: slot.position as string,
        startAt: slot.start_at as string,
        names: ((slot.assignments ?? []) as { status: string; users: { name: string } | null }[])
          .filter((a) => a.status === 'pending' || a.status === 'confirmed')
          .map((a) => a.users?.name ?? '')
          .filter(Boolean),
      }));
      return { linked: true, entries };
    },

    async confirmByTelegram(telegramId, assignmentId) {
      const { error } = await client.rpc('confirm_assignment_tg', {
        p_telegram_id: telegramId,
        p_assignment_id: assignmentId,
      });
      if (error) {
        return { ok: false, code: errorCode(error.message) };
      }
      return { ok: true };
    },
  };
}
