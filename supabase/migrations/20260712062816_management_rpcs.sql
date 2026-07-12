-- Management RPCs: ministries, members, duty slots, assignment removal.
-- Same conventions as the conflict/RPC migration: security definer, caller
-- permission re-checked internally, 42501 for permission, P0001 tokens for
-- validation.

-- ---------------------------------------------------------------------------
-- Ministries (Pastor only)
-- ---------------------------------------------------------------------------

create or replace function public.create_ministry(p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform public._require_actor();
  if public.app_global_role() <> 'pastor' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.ministries (name) values (p_name) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_ministry(text) from public, anon;
grant execute on function public.create_ministry(text) to authenticated;

create or replace function public.archive_ministry(p_ministry_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_actor();
  if public.app_global_role() <> 'pastor' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.ministries set status = 'archived' where id = p_ministry_id;
  if not found then
    raise exception 'ministry_not_found';
  end if;
end;
$$;

revoke execute on function public.archive_ministry(uuid) from public, anon;
grant execute on function public.archive_ministry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Members (Head of that ministry, or Pastor)
-- ---------------------------------------------------------------------------

create or replace function public._require_head_or_pastor(p_ministry_id uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public._require_actor();
  if not (public.app_global_role() = 'pastor'
          or public.has_ministry_role(p_ministry_id, 'head')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public._require_head_or_pastor(uuid) from public, anon;
grant execute on function public._require_head_or_pastor(uuid) to authenticated;

-- Creates a brand-new profile and puts it straight into a ministry.
create or replace function public.add_member(
  p_name        text,
  p_phone       text,
  p_ministry_id uuid,
  p_role        public.ministry_role default 'member',
  p_positions   text[] default '{}'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  perform public._require_head_or_pastor(p_ministry_id);
  insert into public.users (name, phone) values (p_name, p_phone) returning id into v_user;
  insert into public.memberships (user_id, ministry_id, role, positions)
  values (v_user, p_ministry_id, p_role, p_positions);
  return v_user;
end;
$$;

revoke execute on function public.add_member(text, text, uuid, public.ministry_role, text[]) from public, anon;
grant execute on function public.add_member(text, text, uuid, public.ministry_role, text[]) to authenticated;

create or replace function public.upsert_membership(
  p_user_id     uuid,
  p_ministry_id uuid,
  p_role        public.ministry_role,
  p_positions   text[] default '{}'
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_head_or_pastor(p_ministry_id);
  insert into public.memberships (user_id, ministry_id, role, positions)
  values (p_user_id, p_ministry_id, p_role, p_positions)
  on conflict (user_id, ministry_id)
  do update set role = excluded.role, positions = excluded.positions;
end;
$$;

revoke execute on function public.upsert_membership(uuid, uuid, public.ministry_role, text[]) from public, anon;
grant execute on function public.upsert_membership(uuid, uuid, public.ministry_role, text[]) to authenticated;

create or replace function public.remove_membership(p_user_id uuid, p_ministry_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public._require_head_or_pastor(p_ministry_id);
  delete from public.memberships
  where user_id = p_user_id and ministry_id = p_ministry_id;
  if not found then
    raise exception 'membership_not_found';
  end if;
end;
$$;

revoke execute on function public.remove_membership(uuid, uuid) from public, anon;
grant execute on function public.remove_membership(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Duty slots (Head of ministry or Pastor; edits/deletes drafts only)
-- ---------------------------------------------------------------------------

create or replace function public.create_duty_slot(
  p_ministry_id  uuid,
  p_service_date date,
  p_start_at     timestamptz,
  p_end_at       timestamptz,
  p_position     text,
  p_headcount    int default 1
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform public._require_head_or_pastor(p_ministry_id);
  insert into public.duty_slots (ministry_id, service_date, start_at, end_at, position, headcount, created_by)
  values (p_ministry_id, p_service_date, p_start_at, p_end_at, p_position, p_headcount, public.app_user_id())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_duty_slot(uuid, date, timestamptz, timestamptz, text, int) from public, anon;
grant execute on function public.create_duty_slot(uuid, date, timestamptz, timestamptz, text, int) to authenticated;

create or replace function public.update_duty_slot(
  p_slot_id   uuid,
  p_start_at  timestamptz,
  p_end_at    timestamptz,
  p_position  text,
  p_headcount int
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_slot public.duty_slots%rowtype;
begin
  select * into v_slot from public.duty_slots where id = p_slot_id;
  if not found then
    raise exception 'slot_not_found';
  end if;
  perform public._require_head_or_pastor(v_slot.ministry_id);
  if v_slot.status = 'published' then
    raise exception 'slot_published';
  end if;
  update public.duty_slots
     set start_at = p_start_at,
         end_at = p_end_at,
         position = p_position,
         headcount = p_headcount,
         service_date = p_start_at::date
   where id = p_slot_id;
end;
$$;

revoke execute on function public.update_duty_slot(uuid, timestamptz, timestamptz, text, int) from public, anon;
grant execute on function public.update_duty_slot(uuid, timestamptz, timestamptz, text, int) to authenticated;

create or replace function public.delete_duty_slot(p_slot_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_slot public.duty_slots%rowtype;
begin
  select * into v_slot from public.duty_slots where id = p_slot_id;
  if not found then
    raise exception 'slot_not_found';
  end if;
  perform public._require_head_or_pastor(v_slot.ministry_id);
  if v_slot.status = 'published' then
    raise exception 'slot_published';
  end if;
  delete from public.duty_slots where id = p_slot_id;
end;
$$;

revoke execute on function public.delete_duty_slot(uuid) from public, anon;
grant execute on function public.delete_duty_slot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_assignment (IC+ of the slot's ministry, or Pastor)
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
  if not (public.app_global_role() = 'pastor'
          or public.has_ministry_role(v_ministry, 'ic')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.assignments where id = p_assignment_id;
end;
$$;

revoke execute on function public.remove_assignment(uuid) from public, anon;
grant execute on function public.remove_assignment(uuid) to authenticated;
