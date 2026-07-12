// Queue drainer (Deno). Invoked by pg_cron (via pg_net) and manually in dev.
// Requires the service-role key as a bearer token — verify_jwt alone would
// also admit anon-key callers, so we compare explicitly.

import { createClient } from '@supabase/supabase-js';
import { processQueue, type OutboundMessage, type QueueRow } from '../_shared/queue.ts';
import type { NotificationPayload } from '../_shared/messages.ts';

const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
if (!botToken) {
  throw new Error('TELEGRAM_BOT_TOKEN must be set');
}

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
const tz = Deno.env.get('CHURCH_TZ') ?? 'Asia/Singapore';

async function sendTelegram(message: OutboundMessage): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: message.telegramId,
      text: message.text,
      reply_markup: message.replyMarkup,
    }),
  });
  const body = await res.json();
  if (!body.ok) {
    throw new Error(`telegram sendMessage failed: ${body.description ?? res.status}`);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${serviceKey}`) {
    return new Response('forbidden', { status: 403 });
  }

  const { data, error } = await supabase
    .from('notification_queue')
    .select('id, type, payload, users!inner(telegram_id)')
    .is('sent_at', null)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(50);
  if (error) {
    console.error('queue fetch failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const rows: QueueRow[] = (data ?? []).map((r) => ({
    id: r.id as number,
    type: r.type as QueueRow['type'],
    telegramId: (r.users as unknown as { telegram_id: number | null }).telegram_id,
    payload: r.payload as NotificationPayload,
  }));

  const result = await processQueue({
    rows,
    send: sendTelegram,
    markSent: async (id) => {
      const { error: markError } = await supabase
        .from('notification_queue')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', id);
      if (markError) throw new Error(markError.message);
    },
    tz,
  });

  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json' },
  });
});
