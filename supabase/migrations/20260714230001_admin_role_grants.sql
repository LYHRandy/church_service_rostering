-- Grants the 'admin' global role the same permissions as 'pastor' everywhere
-- the matrix names Pastor: the three global-visibility RLS policies and every
-- RPC permission check. Function bodies are re-stated in full from their
-- original migrations with only the role predicate widened.

-- ---------------------------------------------------------------------------
-- RLS policies: staff/pastor global read access now includes admin
-- ---------------------------------------------------------------------------

alter policy duty_slots_select_published_or_admin
  on public.duty_slots
  using (
    status = 'published'
    or public.app_global_role() in ('staff', 'pastor', 'admin')
    or public.has_ministry_role(ministry_id, 'ic')
  );

alter policy assignments_select_own_published_or_admin
  on public.assignments
  using (
    user_id = public.app_user_id()
    or public.app_global_role() in ('staff', 'pastor', 'admin')
    or exists (
      select 1 from public.duty_slots ds
      where ds.id = duty_slot_id
        and (ds.status = 'published' or public.has_ministry_role(ds.ministry_id, 'ic'))
    )
  );

alter policy invite_tokens_select_creator_or_admin
  on public.invite_tokens
  using (
    created_by = public.app_user_id()
    or public.app_global_role() in ('staff', 'pastor', 'admin')
  );

-- ---------------------------------------------------------------------------
-- Ministries (Pastor/Admin only)
-- ---------------------------------------------------------------------------

create or replace function public.create_ministry(p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform public._require_actor();
  if public.app_global_role() not in ('pastor', 'admin') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.ministries (name) values (p_name) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.archive_ministry(p_ministry_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_actor();
  if public.app_global_role() not in ('pastor', 'admin') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.ministries set status = 'archived' where id = p_ministry_id;
  if not found then
    raise exception 'ministry_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared guard (Head of that ministry, or Pastor/Admin)
-- ---------------------------------------------------------------------------

create or replace function public._require_head_or_pastor(p_ministry_id uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public._require_actor();
  if not (public.app_global_role() in ('pastor', 'admin')
          or public.has_ministry_role(p_ministry_id, 'head')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_assignment (IC+ of the slot's ministry, or Pastor/Admin)
-- ---------------------------------------------------------------------------

create or replace function public.remove_assignment(p_assignment_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_ministry uuid;
begin
  perform public._require_actor();
  select ds.ministry_id into v_ministry
  from public.assignments a
  join public.duty_slots ds on ds.id = a.duty_slot_id
  where a.id = p_assignment_id;
  if v_ministry is null then
    raise exception 'assignment_not_found';
  end if;
  if not (public.app_global_role() in ('pastor', 'admin')
          or public.has_ministry_role(v_ministry, 'ic')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.assignments where id = p_assignment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- assign_member (IC/Head of the slot's ministry, or Pastor/Admin)
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

  if not (public.app_global_role() in ('pastor', 'admin')
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

-- ---------------------------------------------------------------------------
-- publish_roster (Head of the ministry, or Pastor/Admin)
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

  if not (public.app_global_role() in ('pastor', 'admin')
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

-- ---------------------------------------------------------------------------
-- create_invite (Head of a ministry the target belongs to, or Pastor/Admin)
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

  if not (public.app_global_role() in ('pastor', 'admin')
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
