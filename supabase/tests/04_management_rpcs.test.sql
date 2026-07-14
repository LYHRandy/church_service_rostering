-- Management RPCs: ministries, members, duty slots, assignment removal.
-- Matrix (PRD §4): create/archive ministries = Pastor; manage members and
-- create slots = Head (own ministry) or Pastor; remove assignment = IC+/Pastor.

begin;
create extension if not exists pgtap with schema extensions;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pastor@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'marcus@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'lydia@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joel@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'priya@test.local'),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'admin@test.local');

-- Non-clergy system administrator (not in seed.sql)
insert into public.users (id, name, global_role, auth_user_id)
values ('10000000-0000-4000-8000-000000000009', 'Alice Admin', 'admin', '90000000-0000-4000-8000-000000000009');

update public.users set auth_user_id = '90000000-0000-4000-8000-000000000001' where id = '10000000-0000-4000-8000-000000000001';
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000003' where id = '10000000-0000-4000-8000-000000000003';
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000004' where id = '10000000-0000-4000-8000-000000000004';
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000005' where id = '10000000-0000-4000-8000-000000000005';
update public.users set auth_user_id = '90000000-0000-4000-8000-000000000006' where id = '10000000-0000-4000-8000-000000000006';

select plan(25);

-- ---------------------------------------------------------------------------
-- Ministries: pastor only
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_ministry('Media')$$, '42501', null,
  'member cannot create ministries');

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.create_ministry('Media')$$, '42501', null,
  'head cannot create ministries');

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select isnt((select public.create_ministry('Media')), null, 'pastor creates a ministry');
select lives_ok(
  $$select public.archive_ministry((select id from public.ministries where name = 'Media'))$$,
  'pastor archives a ministry');
reset role;
select results_eq(
  $$select status::text from public.ministries where name = 'Media'$$,
  $$values ('archived')$$, 'archive is persisted');

-- ---------------------------------------------------------------------------
-- Members: head of that ministry or pastor
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.add_member('New Guy', null, '20000000-0000-4000-8000-000000000001', 'member', '{vocals}')$$,
  '42501', null, 'IC cannot add members');

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.add_member('New Guy', null, '20000000-0000-4000-8000-000000000001', 'member', '{vocals}')$$,
  '42501', null, 'head of another ministry cannot add members here');

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select isnt(
  (select public.add_member('New Guy', '9111', '20000000-0000-4000-8000-000000000001', 'member', '{vocals}')),
  null, 'head adds a member to own ministry');
reset role;
select results_eq(
  $$select m.role::text from public.memberships m
    join public.users u on u.id = m.user_id
    where u.name = 'New Guy' and m.ministry_id = '20000000-0000-4000-8000-000000000001'$$,
  $$values ('member')$$, 'profile and membership are created');

-- upsert: promote Joel to IC in Worship
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.upsert_membership('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'ic', '{vocals}')$$,
  'head updates a membership role');
reset role;
select results_eq(
  $$select role::text from public.memberships
    where user_id = '10000000-0000-4000-8000-000000000005'
      and ministry_id = '20000000-0000-4000-8000-000000000001'$$,
  $$values ('ic')$$, 'role change is persisted');

-- remove: Grace joins Worship then is removed
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.upsert_membership('10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', 'member', '{}')$$,
  'head adds an existing user to own ministry');
select lives_ok(
  $$select public.remove_membership('10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001')$$,
  'head removes a membership');
reset role;
select results_eq(
  $$select count(*)::int from public.memberships
    where user_id = '10000000-0000-4000-8000-000000000008'
      and ministry_id = '20000000-0000-4000-8000-000000000001'$$,
  'select 0', 'membership removal is persisted');

-- ---------------------------------------------------------------------------
-- Duty slots: head of ministry or pastor; edits/deletes on drafts only
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.create_duty_slot('20000000-0000-4000-8000-000000000001', current_date + 14,
      (current_date + 14 + time '09:00')::timestamptz, (current_date + 14 + time '11:00')::timestamptz, 'sound', 1)$$,
  '42501', null, 'IC cannot create duty slots');

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select isnt(
  (select public.create_duty_slot('20000000-0000-4000-8000-000000000001', current_date + 14,
      (current_date + 14 + time '09:00')::timestamptz, (current_date + 14 + time '11:00')::timestamptz, 'sound', 1)),
  null, 'head creates a draft slot');

select throws_ok(
  $$select public.update_duty_slot('30000000-0000-4000-8000-000000000001',
      (current_date + time '09:00')::timestamptz, (current_date + time '11:00')::timestamptz, 'vocals', 3)$$,
  'P0001', 'slot_published', 'published slots cannot be edited');

select throws_ok(
  $$select public.delete_duty_slot('30000000-0000-4000-8000-000000000001')$$,
  'P0001', 'slot_published', 'published slots cannot be deleted');

select lives_ok(
  $$select public.delete_duty_slot('30000000-0000-4000-8000-000000000005')$$,
  'head deletes a draft slot');

-- ---------------------------------------------------------------------------
-- remove_assignment: IC+ of the slot's ministry, or pastor
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.remove_assignment('40000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'a member cannot remove assignments');

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.remove_assignment('40000000-0000-4000-8000-000000000002')$$,
  'IC removes an assignment in own ministry');
reset role;
select results_eq(
  $$select count(*)::int from public.assignments where id = '40000000-0000-4000-8000-000000000002'$$,
  'select 0', 'assignment removal is persisted');

-- ---------------------------------------------------------------------------
-- Admin: pastor-equivalent global rights
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000009","role":"authenticated"}', true);
set local role authenticated;
select isnt((select public.create_ministry('Youth')), null, 'admin creates a ministry');
select lives_ok(
  $$select public.archive_ministry((select id from public.ministries where name = 'Youth'))$$,
  'admin archives a ministry');
select lives_ok(
  $$select public.add_member('Admin Added', null, '20000000-0000-4000-8000-000000000001', 'member', '{}')$$,
  'admin adds members to a ministry they hold no role in');

select * from finish();
rollback;
