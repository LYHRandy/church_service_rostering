-- RLS permissions-matrix tests (PRD §4, MVP subset).
-- Model under test: reads via RLS policies; NO direct writes for any client
-- role — all writes must go through security definer RPCs.
-- Uses seed.sql fixtures (fixed UUIDs) plus per-test auth links below.

begin;
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- Setup (as postgres): link seeded profiles to auth users, add fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pastor@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'marcus@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'lydia@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joel@test.local');

update public.users set auth_user_id = '90000000-0000-4000-8000-000000000001' where id = '10000000-0000-4000-8000-000000000001'; -- pastor
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000003' where id = '10000000-0000-4000-8000-000000000003'; -- Marcus, Worship head
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000004' where id = '10000000-0000-4000-8000-000000000004'; -- Lydia, Worship IC
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000005' where id = '10000000-0000-4000-8000-000000000005'; -- Joel, member

-- Joel assigned on the DRAFT slot (tests "own rows always visible")
insert into public.assignments (duty_slot_id, user_id, status, assigned_by)
values ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005',
        'pending', '10000000-0000-4000-8000-000000000003');

-- An invite created by Marcus for Grace
insert into public.invite_tokens (user_id, created_by)
values ('10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000003');

-- A queued notification for Joel (must stay invisible to clients)
insert into public.notification_queue (user_id, type)
values ('10000000-0000-4000-8000-000000000005', 'published');

select plan(24);

-- ---------------------------------------------------------------------------
-- Anonymous: no table privileges at all (denied before RLS is even consulted)
-- ---------------------------------------------------------------------------
set local role anon;

select throws_ok('select count(*) from public.users', '42501', null,
  'anon cannot select users');
select throws_ok('select count(*) from public.duty_slots', '42501', null,
  'anon cannot select duty slots');
select throws_ok('select count(*) from public.assignments', '42501', null,
  'anon cannot select assignments');

-- ---------------------------------------------------------------------------
-- Joel (plain member, Worship + Ushering)
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;

select results_eq('select count(*)::int from public.users', 'select 8',
  'member sees all user profiles (roster rendering)');
select results_eq('select count(*)::int from public.duty_slots', 'select 4',
  'member sees only the 4 published slots, not the draft');
select results_eq('select count(*)::int from public.assignments', 'select 5',
  'member sees published-slot assignments plus his own draft-slot row');
select results_eq('select count(*)::int from public.app_config', 'select 4',
  'member can read app config');
select results_eq('select count(*)::int from public.invite_tokens', 'select 0',
  'member sees no invite tokens');
select results_eq('select count(*)::int from public.notification_queue', 'select 0',
  'member cannot read the notification queue');

-- member cannot write anything directly
select throws_ok(
  $$insert into public.duty_slots (ministry_id, service_date, start_at, position)
    values ('20000000-0000-4000-8000-000000000001', current_date, now(), 'vocals')$$,
  '42501', null, 'member cannot insert duty slots');
select throws_ok(
  $$insert into public.assignments (duty_slot_id, user_id)
    values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005')$$,
  '42501', null, 'member cannot insert assignments');
select throws_ok(
  $$update public.assignments set status = 'confirmed'
    where user_id = '10000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'member cannot update even his own assignment directly (RPC only)');
select throws_ok(
  $$delete from public.assignments
    where user_id = '10000000-0000-4000-8000-000000000005'$$,
  '42501', null, 'member cannot delete his own assignment');
select throws_ok(
  $$insert into public.notification_queue (user_id, type)
    values ('10000000-0000-4000-8000-000000000005', 'reminder')$$,
  '42501', null, 'member cannot enqueue notifications');

-- ---------------------------------------------------------------------------
-- Lydia (IC of Worship): drafts of own ministry become visible
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

select results_eq('select count(*)::int from public.duty_slots', 'select 5',
  'IC sees published slots plus own-ministry draft');

-- ---------------------------------------------------------------------------
-- Marcus (Head of Worship)
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select results_eq('select count(*)::int from public.duty_slots', 'select 5',
  'head sees published slots plus own-ministry draft');
select results_eq('select count(*)::int from public.assignments', 'select 5',
  'head sees draft-slot assignments in own ministry');
select results_eq('select count(*)::int from public.invite_tokens', 'select 1',
  'head sees invites he created');

-- head still cannot write directly
select throws_ok(
  $$insert into public.users (name) values ('Direct Insert')$$,
  '42501', null, 'head cannot insert users directly');
select throws_ok(
  $$update public.duty_slots set headcount = 9
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'head cannot update duty slots directly (RPC only)');

-- ---------------------------------------------------------------------------
-- Pastor (global)
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select results_eq('select count(*)::int from public.duty_slots', 'select 5',
  'pastor sees every slot including drafts');
select results_eq('select count(*)::int from public.assignments', 'select 5',
  'pastor sees every assignment');
select results_eq('select count(*)::int from public.invite_tokens', 'select 1',
  'pastor sees all invite tokens');
select throws_ok(
  $$update public.app_config set value = '999'
    where key = 'default_duty_buffer_minutes'$$,
  '42501', null, 'even pastor cannot write app_config directly');

select * from finish();
rollback;
