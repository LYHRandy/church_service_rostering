-- Reminder pipeline: pg_cron + pg_net drive the notification queue.
--   1. enqueue-day-before-reminders (hourly): queue reminder rows for
--      tomorrow's published duties, due at the configured local hour.
--   2. drain-notification-queue (every minute): ask the send-notifications
--      edge function to deliver due rows.
-- The edge function URL + service key live in Vault (secrets
-- 'project_functions_url' and 'project_service_role_key'); when they are not
-- configured (fresh local stack) the drain job is a quiet no-op.

create extension if not exists pg_cron;
create extension if not exists pg_net;

insert into public.app_config (key, value) values ('timezone', '"Asia/Singapore"')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Enqueue day-before reminders (idempotent via dedupe_key)
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_day_before_reminders()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_tz     text;
  v_hour   int;
  v_target date;
  v_count  int;
begin
  select coalesce((value #>> '{}'), 'Asia/Singapore') into v_tz
    from public.app_config where key = 'timezone';
  v_tz := coalesce(v_tz, 'Asia/Singapore');
  select coalesce((value #>> '{}')::int, 18) into v_hour
    from public.app_config where key = 'reminder_day_before_hour';
  v_hour := coalesce(v_hour, 18);

  v_target := (now() at time zone v_tz)::date + 1;

  insert into public.notification_queue (user_id, type, dedupe_key, scheduled_for, payload)
  select a.user_id,
         'reminder',
         'reminder:' || a.id,
         greatest(now(),
                  ((v_target - 1)::timestamp + make_interval(hours => v_hour)) at time zone v_tz),
         jsonb_build_object(
           'assignment_id', a.id,
           'duty_slot_id', ds.id,
           'ministry', m.name,
           'position', ds.position,
           'service_date', ds.service_date,
           'start_at', ds.start_at)
  from public.assignments a
  join public.duty_slots ds on ds.id = a.duty_slot_id
  join public.ministries m on m.id = ds.ministry_id
  where ds.service_date = v_target
    and ds.status = 'published'
    and a.status in ('pending', 'confirmed')
  on conflict (dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.enqueue_day_before_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_day_before_reminders() to service_role;

-- ---------------------------------------------------------------------------
-- Drain trigger: POST to the send-notifications edge function via pg_net
-- ---------------------------------------------------------------------------

create or replace function public.invoke_send_notifications()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  -- Skip cheaply when nothing is due.
  if not exists (
    select 1 from public.notification_queue
    where sent_at is null and scheduled_for <= now()
  ) then
    return;
  end if;

  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'project_functions_url';
    select decrypted_secret into v_key
      from vault.decrypted_secrets where name = 'project_service_role_key';
  exception when others then
    raise notice 'vault unavailable; skipping notification drain';
    return;
  end;

  if v_url is null or v_key is null then
    raise notice 'functions url/key not configured in vault; skipping notification drain';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000);
end;
$$;

revoke execute on function public.invoke_send_notifications() from public, anon, authenticated;
grant execute on function public.invoke_send_notifications() to service_role;

-- ---------------------------------------------------------------------------
-- Schedules (also keep the free-tier project awake, PRD §6)
-- ---------------------------------------------------------------------------

select cron.schedule('drain-notification-queue', '* * * * *',
  $$select public.invoke_send_notifications()$$);

select cron.schedule('enqueue-day-before-reminders', '0 * * * *',
  $$select public.enqueue_day_before_reminders()$$);
