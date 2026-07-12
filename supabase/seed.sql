-- Local dev seed. Fixed UUIDs so manual testing and docs can reference rows.
-- Dates are relative (next two Sundays) so the seed never goes stale.
-- Note: Joel belongs to Worship AND Ushering with overlapping 9am slots —
-- assigning him to the Ushering slot is the standing conflict-detection demo.

-- Local-only Vault secrets so the pg_cron drain job reaches the local edge
-- runtime (these are Supabase's public local-dev demo values, not secrets).
-- On a hosted project, create these two Vault secrets once with the real
-- functions URL and service-role key.
select vault.create_secret('http://supabase_kong_church_service_rostering:8000/functions/v1', 'project_functions_url');
select vault.create_secret('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU', 'project_service_role_key');

-- Users -----------------------------------------------------------------
insert into public.users (id, name, telegram_id, global_role) values
  ('10000000-0000-4000-8000-000000000001', 'David Tan (Pastor)',  null, 'pastor'),
  ('10000000-0000-4000-8000-000000000002', 'Sarah Lim (Staff)',   null, 'staff'),
  ('10000000-0000-4000-8000-000000000003', 'Marcus Chen',         null, 'none'),
  ('10000000-0000-4000-8000-000000000004', 'Lydia Ong',           null, 'none'),
  ('10000000-0000-4000-8000-000000000005', 'Joel Wong',           null, 'none'),
  ('10000000-0000-4000-8000-000000000006', 'Priya Nair',          null, 'none'),
  ('10000000-0000-4000-8000-000000000007', 'Ken Loh',             null, 'none'),
  ('10000000-0000-4000-8000-000000000008', 'Grace Ho',            null, 'none');

-- Ministries (Service Direction is a regular ministry — no special-casing) --
insert into public.ministries (id, name) values
  ('20000000-0000-4000-8000-000000000001', 'Worship'),
  ('20000000-0000-4000-8000-000000000002', 'Ushering'),
  ('20000000-0000-4000-8000-000000000003', 'Service Direction');

-- Memberships ------------------------------------------------------------
insert into public.memberships (user_id, ministry_id, role, positions) values
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'head',   '{vocals,sound}'),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'ic',     '{sound}'),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'member', '{vocals}'),
  ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', 'head',   '{usher}'),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 'member', '{usher}'),
  ('10000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000002', 'member', '{usher}'),
  ('10000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000003', 'head',   '{service_director}');

-- Duty slots: Sunday 9:00–11:00 service ----------------------------------
insert into public.duty_slots (id, ministry_id, service_date, start_at, end_at, position, headcount, status, created_by)
with _d as (
  select
    (current_date + ((7 - extract(dow from current_date)::int) % 7))::date     as sun1,
    (current_date + ((7 - extract(dow from current_date)::int) % 7) + 7)::date as sun2
)
select * from (
  -- Published: this Sunday
  select '30000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid,
         sun1, sun1 + time '09:00', sun1 + time '11:00', 'vocals', 2, 'published'::public.slot_status,
         '10000000-0000-4000-8000-000000000003'::uuid
  from _d
  union all
  select '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
         sun1, sun1 + time '09:00', sun1 + time '11:00', 'sound', 1, 'published',
         '10000000-0000-4000-8000-000000000003' from _d
  union all
  select '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002',
         sun1, sun1 + time '09:00', sun1 + time '11:00', 'usher', 2, 'published',
         '10000000-0000-4000-8000-000000000006' from _d
  union all
  -- No end_at: exercises the default 2h buffer in conflict checks.
  select '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003',
         sun1, sun1 + time '09:00', null, 'service_director', 1, 'published',
         '10000000-0000-4000-8000-000000000007' from _d
  union all
  -- Draft: next Sunday, not yet visible to members
  select '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
         sun2, sun2 + time '09:00', sun2 + time '11:00', 'vocals', 2, 'draft',
         '10000000-0000-4000-8000-000000000003' from _d
) s;


-- Assignments (raw inserts are seed-only; app code must use assign_member) --
insert into public.assignments (id, duty_slot_id, user_id, status, assigned_by) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000005', 'pending',   '10000000-0000-4000-8000-000000000003'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000004', 'confirmed', '10000000-0000-4000-8000-000000000003'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000008', 'pending',   '10000000-0000-4000-8000-000000000006'),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004',
   '10000000-0000-4000-8000-000000000007', 'confirmed', '10000000-0000-4000-8000-000000000007');

