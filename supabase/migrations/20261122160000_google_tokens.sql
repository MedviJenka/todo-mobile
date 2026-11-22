-- Google refresh token per user, written and read only by the google-token Edge Function.
-- Owner-only RLS like every other table. On its own the token is useless: refreshing it needs
-- the Web client secret, which lives only in Edge Function secrets.

create table public.google_tokens (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

create trigger google_tokens_updated_at
  before update on public.google_tokens
  for each row execute function public.set_updated_at();

alter table public.google_tokens enable row level security;

create policy owner_all on public.google_tokens for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.google_tokens from anon;
grant select, insert, update, delete on public.google_tokens to authenticated;
