-- Conflict engine + write RPCs.
-- THE conflict function (SPEC: implemented once, called by every path) and the
-- security definer RPCs that are the only way clients change roster state.
-- Every RPC re-checks the caller's PRD §4 permission internally (defense in
-- depth over RLS). Errors: permission → 42501, validation → P0001 with a
-- stable message token the UI/bot can map to friendly text.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public.duty_buffer()
returns interval
language sql stable security definer set search_path = public
as $$
  select make_interval(mins => coalesce(
    (select (value #>> '{}')::int from public.app_config
      where key = 'default_duty_buffer_minutes'),
    120));
$$;

revoke execute on function public.duty_buffer() from public, anon;
grant execute on function public.duty_buffer() to authenticated, service_role;

-- Actor for RPCs: the app user behind the current JWT; raises if absent.
create or replace function public._require_actor()
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare v_actor uuid;
begin
  v_actor := public.app_user_id();
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke execute on function public._require_actor() from public, anon;
grant execute on function public._require_actor() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- check_conflicts — the single source of overlap truth.
-- A null end (candidate or existing slot) gets the configured default buffer.
-- Ranges are [start, end): back-to-back duties do not conflict.
-- ---------------------------------------------------------------------------

create or replace function public.check_conflicts(
  p_user_id uuid,
  p_start   timestamptz,
  p_end     timestamptz default null
)
returns table (
  assignment_id uuid,
  duty_slot_id  uuid,
  ministry_name text,
  "position"    text,
  start_at      timestamptz,
  end_at        timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_range tstzrange;
begin
  v_range := tstzrange(p_start, coalesce(p_end, p_start + public.duty_buffer()), '[)');
  return query
    select a.id, ds.id, m.name, ds.position, ds.start_at, ds.end_at
    from public.assignments a
    join public.duty_slots ds on ds.id = a.duty_slot_id
    join public.ministries m on m.id = ds.ministry_id
    where a.user_id = p_user_id
      and a.status in ('pending', 'confirmed')
      and tstzrange(ds.start_at,
                    coalesce(ds.end_at, ds.start_at + public.duty_buffer()),
                    '[)') && v_range;
end;
$$;

revoke execute on function public.check_conflicts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.check_conflicts(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- assign_member — matrix: IC/Head of the slot's ministry, or Pastor.
-- Returns {status: assigned|conflict|already_assigned, ...}.
-- ---------------------------------------------------------------------------

create or replace function public.assign_member(
  p_duty_slot_id   uuid,
  p_user_id        uuid,
  p_allow_conflict boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor     uuid;
  v_slot      public.duty_slots%rowtype;
  v_conflicts jsonb;
  v_n         int;
  v_id        uuid;
begin
  v_actor := public._require_actor();

  select * into v_slot from public.duty_slots where id = p_duty_slot_id;
  if not found then
    raise exception 'slot_not_found';
  end if;

  if not (public.app_global_role() = 'pastor'
          or public.has_ministry_role(v_slot.ministry_id, 'ic')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if not exists (select 1 from public.memberships
                 where user_id = p_user_id and ministry_id = v_slot.ministry_id) then
    raise exception 'not_a_member';
  end if;

  if exists (select 1 from public.assignments
             where duty_slot_id = p_duty_slot_id and user_id = p_user_id) then
    return jsonb_build_object('status', 'already_assigned');
  end if;

  select count(*), coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
    into v_n, v_conflicts
    from public.check_conflicts(p_user_id, v_slot.start_at, v_slot.end_at) c;

  if v_n > 0 and not p_allow_conflict then
    return jsonb_build_object('status', 'conflict', 'conflicts', v_conflicts);
  end if;

  insert into public.assignments (duty_slot_id, user_id, conflict_acknowledged, assigned_by)
  values (p_duty_slot_id, p_user_id, v_n > 0, v_actor)
  returning id into v_id;

  return jsonb_build_object(
    'status', 'assigned',
    'assignment_id', v_id,
    'conflict_acknowledged', v_n > 0);
end;
$$;

revoke execute on function public.assign_member(uuid, uuid, boolean) from public, anon;
grant execute on function public.assign_member(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- confirm_assignment (web: assignee only) / confirm_assignment_tg (bot only)
-- ---------------------------------------------------------------------------

create or replace function public._confirm(p_assignment_id uuid, p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_row public.assignments%rowtype;
begin
  select * into v_row from public.assignments where id = p_assignment_id;
  if not found then
    raise exception 'assignment_not_found';
  end if;
  if v_row.user_id is distinct from p_user_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_row.status = 'pending' then
    update public.assignments set status = 'confirmed' where id = p_assignment_id;
  end if;
  return jsonb_build_object('status', 'confirmed', 'assignment_id', p_assignment_id);
end;
$$;

revoke execute on function public._confirm(uuid, uuid) from public, anon, authenticated;
grant execute on function public._confirm(uuid, uuid) to service_role;

create or replace function public.confirm_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  return public._confirm(p_assignment_id, public._require_actor());
end;
$$;

revoke execute on function public.confirm_assignment(uuid) from public, anon;
grant execute on function public.confirm_assignment(uuid) to authenticated;

create or replace function public.confirm_assignment_tg(p_telegram_id bigint, p_assignment_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  select id into v_user from public.users where telegram_id = p_telegram_id;
  if v_user is null then
    raise exception 'telegram_not_linked';
  end if;
  return public._confirm(p_assignment_id, v_user);
end;
$$;

revoke execute on function public.confirm_assignment_tg(bigint, uuid) from public, anon, authenticated;
grant execute on function public.confirm_assignment_tg(bigint, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- publish_roster — matrix: Head of the ministry, or Pastor.
-- Publishes draft slots in the date range and queues one 'published'
-- notification per affected assignment (deduped, so republishing is safe).
-- ---------------------------------------------------------------------------

create or replace function public.publish_roster(
  p_ministry_id uuid,
  p_from        date,
  p_to          date
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid;
  v_slots uuid[];
  v_queued int;
begin
  v_actor := public._require_actor();

  if not (public.app_global_role() = 'pastor'
          or public.has_ministry_role(p_ministry_id, 'head')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  with published as (
    update public.duty_slots
       set status = 'published'
     where ministry_id = p_ministry_id
       and service_date between p_from and p_to
       and status = 'draft'
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_slots from published;

  with queued as (
    insert into public.notification_queue (user_id, type, dedupe_key, payload)
    select a.user_id,
           'published',
           'published:' || a.id,
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
    where a.duty_slot_id = any (v_slots)
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_queued from queued;

  return jsonb_build_object(
    'published_slots', coalesce(array_length(v_slots, 1), 0),
    'notifications_queued', v_queued);
end;
$$;

revoke execute on function public.publish_roster(uuid, date, date) from public, anon;
grant execute on function public.publish_roster(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- create_invite — matrix "Manage ministry members": Head of a ministry the
-- target belongs to, or Pastor. Returns the deep-link token.
-- ---------------------------------------------------------------------------

create or replace function public.create_invite(p_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid;
  v_token uuid;
begin
  v_actor := public._require_actor();

  if not (public.app_global_role() = 'pastor'
          or exists (
            select 1
            from public.memberships target
            join public.memberships me
              on me.ministry_id = target.ministry_id
            where target.user_id = p_user_id
              and me.user_id = v_actor
              and me.role = 'head')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.invite_tokens (user_id, created_by)
  values (p_user_id, v_actor)
  returning token into v_token;

  return v_token;
end;
$$;

revoke execute on function public.create_invite(uuid) from public, anon;
grant execute on function public.create_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- link_telegram_account — bot only (service role). Atomically validates the
-- invite token and links the Telegram account to the member profile.
-- ---------------------------------------------------------------------------

create or replace function public.link_telegram_account(p_token uuid, p_telegram_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_invite public.invite_tokens%rowtype;
  v_name   text;
begin
  select * into v_invite
  from public.invite_tokens
  where token = p_token
  for update;

  if not found or v_invite.used_at is not null or v_invite.expires_at <= now() then
    raise exception 'invalid_token';
  end if;

  if exists (select 1 from public.users
             where telegram_id = p_telegram_id and id <> v_invite.user_id) then
    raise exception 'telegram_already_linked';
  end if;

  update public.users
     set telegram_id = p_telegram_id
   where id = v_invite.user_id
   returning name into v_name;

  update public.invite_tokens set used_at = now() where token = p_token;

  return jsonb_build_object('user_id', v_invite.user_id, 'name', v_name);
end;
$$;

revoke execute on function public.link_telegram_account(uuid, bigint) from public, anon, authenticated;
grant execute on function public.link_telegram_account(uuid, bigint) to service_role;
