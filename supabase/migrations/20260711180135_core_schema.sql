-- Core schema for Phase 1 MVP (SPEC.md, PRD §5).
-- Deferred to Phase 2+: events, event_roles, unavailability, swap_requests,
-- service_orders, service_order_access, audit_log, recurring templates.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.global_role as enum ('none', 'staff', 'pastor');
create type public.ministry_role as enum ('member', 'ic', 'head');
create type public.ministry_status as enum ('active', 'archived');
create type public.slot_status as enum ('draft', 'published');
-- Full PRD set; MVP uses pending/confirmed, swap values land in Phase 2.
create type public.assignment_status as enum ('pending', 'confirmed', 'swap_requested', 'swapped');
create type public.notification_type as enum ('reminder', 'published');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  -- Set when the person links Telegram / first logs in; profiles are created
  -- by admins before that, so this starts null.
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  name          text not null,
  telegram_id   bigint unique,
  phone         text,
  global_role   public.global_role not null default 'none',
  created_at    timestamptz not null default now()
);

create table public.ministries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  status      public.ministry_status not null default 'active',
  created_at  timestamptz not null default now()
);

create table public.memberships (
  user_id     uuid not null references public.users (id) on delete cascade,
  ministry_id uuid not null references public.ministries (id) on delete cascade,
  role        public.ministry_role not null default 'member',
  -- Positions this person can serve, e.g. {vocals,sound} or {service_director}.
  positions   text[] not null default '{}',
  created_at  timestamptz not null default now(),
  primary key (user_id, ministry_id)
);

create table public.duty_slots (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries (id) on delete cascade,
  service_date date not null,
  start_at    timestamptz not null,
  -- Nullable: conflict engine applies the app_config default buffer instead.
  end_at      timestamptz,
  position    text not null,
  headcount   int not null default 1 check (headcount > 0),
  status      public.slot_status not null default 'draft',
  created_by  uuid references public.users (id),
  created_at  timestamptz not null default now(),
  check (end_at is null or end_at > start_at)
);

create table public.assignments (
  id                    uuid primary key default gen_random_uuid(),
  duty_slot_id          uuid not null references public.duty_slots (id) on delete cascade,
  user_id               uuid not null references public.users (id) on delete cascade,
  status                public.assignment_status not null default 'pending',
  conflict_acknowledged boolean not null default false,
  assigned_by           uuid references public.users (id),
  created_at            timestamptz not null default now(),
  unique (duty_slot_id, user_id)
);

create table public.invite_tokens (
  token       uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  created_by  uuid references public.users (id),
  expires_at  timestamptz not null default now() + interval '14 days',
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table public.notification_queue (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.users (id) on delete cascade,
  type          public.notification_type not null,
  payload       jsonb not null default '{}',
  -- Unique key preventing double-enqueue (e.g. reminder:<assignment_id>).
  dedupe_key    text unique,
  scheduled_for timestamptz not null default now(),
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value) values
  ('default_duty_buffer_minutes', '120'),
  ('reminder_day_before_hour', '18'),
  ('reminder_morning_of', 'false');

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index memberships_ministry_idx on public.memberships (ministry_id);
create index duty_slots_ministry_date_idx on public.duty_slots (ministry_id, service_date);
create index duty_slots_date_idx on public.duty_slots (service_date);
create index assignments_user_idx on public.assignments (user_id);
create index assignments_slot_idx on public.assignments (duty_slot_id);
create index notification_queue_due_idx on public.notification_queue (scheduled_for) where sent_at is null;
create index invite_tokens_user_idx on public.invite_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Identity helpers (used by RLS in the next migration and by RPCs)
-- ---------------------------------------------------------------------------

-- The app user id for the current JWT, or null.
create or replace function public.app_user_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.users where auth_user_id = auth.uid();
$$;

create or replace function public.app_global_role()
returns public.global_role
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select global_role from public.users where auth_user_id = auth.uid()),
    'none'
  );
$$;

-- True if the current user holds `min_role` or higher in the ministry.
-- Relies on ministry_role enum order: member < ic < head.
create or replace function public.has_ministry_role(p_ministry_id uuid, p_min_role public.ministry_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.ministry_id = p_ministry_id
      and m.user_id = public.app_user_id()
      and m.role >= p_min_role
  );
$$;
