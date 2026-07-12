-- Conflict engine + write RPCs (SPEC: single check_conflicts function; all
-- state changes through security definer RPCs enforcing the PRD §4 matrix).
-- Uses seed.sql fixtures. Key fixture: Joel is a member of BOTH Worship and
-- Ushering, with a pending Worship assignment this Sunday 09:00–11:00.

begin;
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- Setup (as postgres)
-- ---------------------------------------------------------------------------

create temporary table _d as
select (current_date + ((7 - extract(dow from current_date)::int) % 7))::date as sun1,
       (current_date + ((7 - extract(dow from current_date)::int) % 7) + 7)::date as sun2;
grant select on _d to public;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pastor@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'marcus@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'lydia@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joel@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'priya@test.local');

update public.users set auth_user_id = '90000000-0000-4000-8000-000000000001' where id = '10000000-0000-4000-8000-000000000001';
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000003' where id = '10000000-0000-4000-8000-000000000003';
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000004' where id = '10000000-0000-4000-8000-000000000004';
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000005' where id = '10000000-0000-4000-8000-000000000005';
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000006' where id = '10000000-0000-4000-8000-000000000006';

-- Joel's Telegram is linked (for the bot-confirm test)
update public.users set telegram_id = 555001 where id = '10000000-0000-4000-8000-000000000005';

-- Invite-token fixtures for link_telegram_account tests
insert into public.invite_tokens (token, user_id, created_by) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000006'); -- Grace
insert into public.invite_tokens (token, user_id, created_by, expires_at) values
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', now() - interval '1 day'); -- Ken, EXPIRED
insert into public.invite_tokens (token, user_id, created_by) values
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001'); -- Ken, valid

select plan(35);

-- ---------------------------------------------------------------------------
-- check_conflicts: pure logic (as postgres)
-- Seeded: Joel pending on Worship vocals sun1 09:00–11:00.
--         Ken confirmed on Service Direction sun1 09:00 with NULL end (2h buffer).
-- ---------------------------------------------------------------------------

select results_eq(
  $$select count(*)::int from public.check_conflicts('10000000-0000-4000-8000-000000000005',
      (select sun1 + time '09:00' from _d)::timestamptz, (select sun1 + time '11:00' from _d)::timestamptz)$$,
  'select 1', 'overlap in another ministry is detected');

select results_eq(
  $$select count(*)::int from public.check_conflicts('10000000-0000-4000-8000-000000000005',
      (select sun1 + time '11:00' from _d)::timestamptz, (select sun1 + time '12:00' from _d)::timestamptz)$$,
  'select 0', 'adjacent slot starting at the previous end is NOT a conflict');

select results_eq(
  $$select count(*)::int from public.check_conflicts('10000000-0000-4000-8000-000000000007',
      (select sun1 + time '10:30' from _d)::timestamptz, (select sun1 + time '12:00' from _d)::timestamptz)$$,
  'select 1', 'slot with no end time blocks within the default 2h buffer');

select results_eq(
  $$select count(*)::int from public.check_conflicts('10000000-0000-4000-8000-000000000007',
      (select sun1 + time '11:00' from _d)::timestamptz, (select sun1 + time '12:00' from _d)::timestamptz)$$,
  'select 0', 'slot with no end time does NOT block after the buffer expires');

select results_eq(
  $$select count(*)::int from public.check_conflicts('10000000-0000-4000-8000-000000000005',
      (select sun1 + time '10:30' from _d)::timestamptz, null)$$,
  'select 1', 'candidate with no end time gets the buffer applied too');

-- ---------------------------------------------------------------------------
-- assign_member
-- ---------------------------------------------------------------------------

-- Joel (plain member) may not assign
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.assign_member('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000008')$$,
  '42501', null, 'plain member cannot assign');

-- Priya (Ushering head) assigning Joel (already on Worship 9–11) → conflict
reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select public.assign_member('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005')->>'status'),
  'conflict', 'cross-ministry overlap blocks assignment by default');

select is(
  (select jsonb_array_length(public.assign_member('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005')->'conflicts')),
  1, 'the conflicting duty is returned to the caller');

select is(
  (select public.assign_member('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', true)->>'status'),
  'assigned', 'explicit override proceeds');

reset role;
select results_eq(
  $$select count(*)::int from public.assignments
    where duty_slot_id = '30000000-0000-4000-8000-000000000003'
      and user_id = '10000000-0000-4000-8000-000000000005'
      and conflict_acknowledged$$,
  'select 1', 'overridden assignment is stored with conflict_acknowledged = true');

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select public.assign_member('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', true)->>'status'),
  'already_assigned', 'assigning the same person twice reports already_assigned');

select throws_ok(
  $$select public.assign_member('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004')$$,
  'P0001', 'not_a_member', 'cannot assign someone outside the ministry');

-- Marcus (Worship head) may not assign into Ushering
reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.assign_member('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000008')$$,
  '42501', null, 'head of another ministry cannot assign here');

-- Pastor can assign anywhere: Joel onto next Sunday's DRAFT Worship slot
reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select public.assign_member('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005')->>'status'),
  'assigned', 'pastor can assign in any ministry');

-- ---------------------------------------------------------------------------
-- confirm_assignment (web) and confirm_assignment_tg (bot, service role only)
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.confirm_assignment('40000000-0000-4000-8000-000000000001')$$,
  'assignee can confirm own assignment');
select lives_ok(
  $$select public.confirm_assignment('40000000-0000-4000-8000-000000000001')$$,
  'confirming twice is idempotent');

reset role;
select results_eq(
  $$select status::text from public.assignments where id = '40000000-0000-4000-8000-000000000001'$$,
  $$values ('confirmed')$$, 'confirmation is persisted');

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.confirm_assignment('40000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'cannot confirm someone else''s assignment');

select throws_ok(
  $$select public.confirm_assignment_tg(555001, '40000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'authenticated web users cannot call the bot confirm function');

reset role;
set local role service_role;
select lives_ok(
  $$select public.confirm_assignment_tg(555001,
      (select id from public.assignments
       where duty_slot_id = '30000000-0000-4000-8000-000000000003'
         and user_id = '10000000-0000-4000-8000-000000000005'))$$,
  'bot (service role) confirms via telegram id');
reset role;
select results_eq(
  $$select status::text from public.assignments
    where duty_slot_id = '30000000-0000-4000-8000-000000000003'
      and user_id = '10000000-0000-4000-8000-000000000005'$$,
  $$values ('confirmed')$$, 'bot confirmation is persisted');

-- ---------------------------------------------------------------------------
-- publish_roster
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.publish_roster('20000000-0000-4000-8000-000000000001',
      (select sun2 from _d), (select sun2 from _d))$$,
  '42501', null, 'IC cannot publish the roster');

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select (public.publish_roster('20000000-0000-4000-8000-000000000001',
      (select sun2 from _d), (select sun2 from _d))->>'published_slots')::int),
  1, 'head publishes the draft slot');

reset role;
select results_eq(
  $$select count(*)::int from public.notification_queue where type = 'published'$$,
  'select 1', 'publishing queues one notification per assignee');

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select (public.publish_roster('20000000-0000-4000-8000-000000000001',
      (select sun2 from _d), (select sun2 from _d))->>'published_slots')::int),
  0, 'republishing the same range publishes nothing new');

reset role;
select results_eq(
  $$select count(*)::int from public.notification_queue where type = 'published'$$,
  'select 1', 'republishing does not duplicate notifications (dedupe key)');

-- ---------------------------------------------------------------------------
-- create_invite
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select isnt(
  (select public.create_invite('10000000-0000-4000-8000-000000000008')),
  null, 'head can create an invite for their ministry member');

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_invite('10000000-0000-4000-8000-000000000005')$$,
  '42501', null, 'IC cannot create invites');

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_invite('10000000-0000-4000-8000-000000000008')$$,
  '42501', null, 'head cannot invite members of other ministries');

-- ---------------------------------------------------------------------------
-- link_telegram_account (service role only)
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.link_telegram_account('50000000-0000-4000-8000-000000000001', 777001)$$,
  '42501', null, 'web users cannot call link_telegram_account');

reset role;
set local role service_role;
select lives_ok(
  $$select public.link_telegram_account('50000000-0000-4000-8000-000000000001', 777001)$$,
  'bot links a valid invite token');
reset role;
select results_eq(
  $$select telegram_id from public.users where id = '10000000-0000-4000-8000-000000000008'$$,
  $$values (777001::bigint)$$, 'telegram id is linked to the invited profile');

set local role service_role;
select throws_ok(
  $$select public.link_telegram_account('50000000-0000-4000-8000-000000000001', 777002)$$,
  'P0001', 'invalid_token', 'a used token cannot be reused');
select throws_ok(
  $$select public.link_telegram_account('50000000-0000-4000-8000-000000000002', 777003)$$,
  'P0001', 'invalid_token', 'an expired token is rejected');
select throws_ok(
  $$select public.link_telegram_account('50000000-0000-4000-8000-000000000003', 777001)$$,
  'P0001', 'telegram_already_linked', 'a telegram account cannot be linked to two profiles');
reset role;

select * from finish();
rollback;
