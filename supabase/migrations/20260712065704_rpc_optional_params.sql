-- Make genuinely-optional RPC params optional in the API surface:
-- p_phone (add_member) and p_end_at (create_duty_slot) default to null, so
-- generated client types mark them optional. Bodies are unchanged except
-- normalising empty phone to null.

create or replace function public.add_member(
  p_name        text,
  p_phone       text default null,
  p_ministry_id uuid default null,
  p_role        public.ministry_role default 'member',
  p_positions   text[] default '{}'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  if p_ministry_id is null then
    raise exception 'ministry_required';
  end if;
  perform public._require_head_or_pastor(p_ministry_id);
  insert into public.users (name, phone)
  values (p_name, nullif(trim(coalesce(p_phone, '')), ''))
  returning id into v_user;
  insert into public.memberships (user_id, ministry_id, role, positions)
  values (v_user, p_ministry_id, p_role, p_positions);
  return v_user;
end;
$$;

create or replace function public.create_duty_slot(
  p_ministry_id  uuid,
  p_service_date date,
  p_start_at     timestamptz,
  p_end_at       timestamptz default null,
  p_position     text default null,
  p_headcount    int default 1
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if p_position is null or trim(p_position) = '' then
    raise exception 'position_required';
  end if;
  perform public._require_head_or_pastor(p_ministry_id);
  insert into public.duty_slots (ministry_id, service_date, start_at, end_at, position, headcount, created_by)
  values (p_ministry_id, p_service_date, p_start_at, p_end_at, p_position, p_headcount, public.app_user_id())
  returning id into v_id;
  return v_id;
end;
$$;
