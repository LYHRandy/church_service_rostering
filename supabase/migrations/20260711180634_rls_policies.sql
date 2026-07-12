-- Privileges + Row-Level Security (PRD §4 permissions matrix, MVP subset).
--
-- Model:
--   anon           → no table privileges at all
--   authenticated  → SELECT only; rows gated by the policies below.
--                    NO direct writes: every state change goes through
--                    security definer RPCs (next migration).
--   service_role   → full access (notification sender, auth minting).

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;

-- Future tables in later migrations must declare their own grants explicitly.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.ministries enable row level security;
alter table public.memberships enable row level security;
alter table public.duty_slots enable row level security;
alter table public.assignments enable row level security;
alter table public.invite_tokens enable row level security;
alter table public.notification_queue enable row level security;
alter table public.app_config enable row level security;

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------

-- users / ministries / memberships: visible to all signed-in users — needed to
-- render rosters, member pickers, and "which ministries am I in".
create policy users_select_authenticated
  on public.users for select to authenticated
  using (true);

create policy ministries_select_authenticated
  on public.ministries for select to authenticated
  using (true);

create policy memberships_select_authenticated
  on public.memberships for select to authenticated
  using (true);

-- duty_slots: published slots visible to everyone signed in (full-year
-- roster); drafts only to that ministry's ICs/heads and global admins.
create policy duty_slots_select_published_or_admin
  on public.duty_slots for select to authenticated
  using (
    status = 'published'
    or public.app_global_role() in ('staff', 'pastor')
    or public.has_ministry_role(ministry_id, 'ic')
  );

-- assignments: own rows always; rows on published slots to everyone signed in;
-- draft-slot rows to that ministry's ICs/heads and global admins.
create policy assignments_select_own_published_or_admin
  on public.assignments for select to authenticated
  using (
    user_id = public.app_user_id()
    or public.app_global_role() in ('staff', 'pastor')
    or exists (
      select 1 from public.duty_slots ds
      where ds.id = duty_slot_id
        and (ds.status = 'published' or public.has_ministry_role(ds.ministry_id, 'ic'))
    )
  );

-- invite_tokens: creator and global admins only — tokens are secrets.
create policy invite_tokens_select_creator_or_admin
  on public.invite_tokens for select to authenticated
  using (
    created_by = public.app_user_id()
    or public.app_global_role() in ('staff', 'pastor')
  );

-- app_config: readable by signed-in users (UI shows buffer/reminder settings).
create policy app_config_select_authenticated
  on public.app_config for select to authenticated
  using (true);

-- notification_queue: intentionally NO policies — service role only.
