-- Reminder pipeline: enqueue_day_before_reminders() idempotency and the
-- pg_cron jobs that drive the notification flow.

begin;
create extension if not exists pgtap with schema extensions;

-- Fixtures: a published slot TOMORROW (church tz) with two assignees, and a
-- published slot the day after (must NOT be enqueued yet).
insert into public.duty_slots (id, ministry_id, service_date, start_at, end_at, position, headcount, status, created_by)
select '31000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
       d, d + time '09:00', d + time '11:00', 'vocals', 2, 'published',
       '10000000-0000-4000-8000-000000000003'
from (select (now() at time zone 'Asia/Singapore')::date + 1 as d) t;

insert into public.duty_slots (id, ministry_id, service_date, start_at, end_at, position, headcount, status, created_by)
select '31000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
       d, d + time '09:00', d + time '11:00', 'sound', 1, 'published',
       '10000000-0000-4000-8000-000000000003'
from (select (now() at time zone 'Asia/Singapore')::date + 2 as d) t;

insert into public.assignments (id, duty_slot_id, user_id, status, assigned_by) values
  ('41000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000005', 'confirmed', '10000000-0000-4000-8000-000000000003'),
  ('41000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000003', 'pending', '10000000-0000-4000-8000-000000000003'),
  ('41000000-0000-4000-8000-000000000003', '31000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000004', 'confirmed', '10000000-0000-4000-8000-000000000003');

select plan(6);

select lives_ok('select public.enqueue_day_before_reminders()',
  'enqueue function runs');

select results_eq(
  $$select count(*)::int from public.notification_queue where type = 'reminder'$$,
  'select 2',
  'one reminder queued per assignee serving tomorrow');

select results_eq(
  $$select count(*)::int from public.notification_queue
    where dedupe_key = 'reminder:41000000-0000-4000-8000-000000000003'$$,
  'select 0',
  'duties beyond tomorrow are not reminded yet');

select lives_ok('select public.enqueue_day_before_reminders()',
  'second run is safe');

select results_eq(
  $$select count(*)::int from public.notification_queue where type = 'reminder'$$,
  'select 2',
  'rerunning enqueues nothing new (dedupe)');

select results_eq(
  $$select count(*)::int from cron.job
    where jobname in ('drain-notification-queue', 'enqueue-day-before-reminders')$$,
  'select 2',
  'both cron jobs are scheduled');

select * from finish();
rollback;
