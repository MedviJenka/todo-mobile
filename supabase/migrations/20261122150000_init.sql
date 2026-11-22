-- Voice To-Do: initial schema (PRODUCT_PLAN §9).
-- Every table is owner-only through RLS. Audio is never stored.

-- ---------------------------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- user_settings: one row per user
-- ---------------------------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  time_zone text not null,
  day_start time not null default '09:00',
  day_end time not null default '20:00',
  buffer_minutes smallint not null default 10 check (buffer_minutes between 0 and 120),
  reminder_minutes smallint not null default 10 check (reminder_minutes between 0 and 240),
  app_calendar_id text,
  updated_at timestamptz not null default now(),
  constraint user_settings_active_hours check (day_end > day_start)
);

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- captures: transcript history (the user can delete it)
-- ---------------------------------------------------------------------------------------------
create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transcript text not null check (char_length(transcript) <= 20000),
  audio_seconds numeric(6, 1),
  created_at timestamptz not null default now()
);

-- Daily rate-limit count in the Edge Functions
create index captures_user_created on public.captures (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  capture_id uuid references public.captures (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  notes text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  duration_minutes int not null default 30 check (duration_minutes between 5 and 480),
  fixed_start timestamptz,
  not_before timestamptz,
  deadline timestamptz,
  preferred_window text check (preferred_window in ('morning', 'afternoon', 'evening')),
  schedule_to_calendar boolean not null default true,
  status text not null default 'todo' check (status in ('todo', 'done')),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  calendar_event_id text,
  unscheduled_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_scheduled_range check (
    (scheduled_start is null and scheduled_end is null)
    or (scheduled_start is not null and scheduled_end is not null and scheduled_end > scheduled_start)
  )
);

create index tasks_user_status_start on public.tasks (user_id, status, scheduled_start);
create index tasks_capture on public.tasks (capture_id);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Row level security: owner-only on every table
-- ---------------------------------------------------------------------------------------------
alter table public.user_settings enable row level security;
alter table public.captures enable row level security;
alter table public.tasks enable row level security;

create policy owner_all on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_all on public.captures for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_all on public.tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Explicit Data API grants (newer projects don't expose new public tables by default).
-- anon gets nothing.
revoke all on public.user_settings, public.captures, public.tasks from anon;
grant select, insert, update, delete on public.user_settings, public.captures, public.tasks to authenticated;
