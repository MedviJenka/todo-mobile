-- People the user shared the "Voice To-Do" calendar with. Google holds the actual access (a
-- calendar ACL rule); this row is the saved contact card (name + email) and the role granted.

create table public.calendar_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  role text not null check (role in ('reader', 'freeBusyReader')),
  -- Google's ACL rule id ("user:<email>"), used to remove access.
  acl_rule_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_shares_one_per_email unique (user_id, email)
);

create trigger calendar_shares_updated_at
  before update on public.calendar_shares
  for each row execute function public.set_updated_at();

alter table public.calendar_shares enable row level security;

create policy owner_all on public.calendar_shares for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.calendar_shares from anon;
grant select, insert, update, delete on public.calendar_shares to authenticated;
