-- Security hardening (security review, 2026-11-23).

-- ---------------------------------------------------------------------------------------------
-- ai_usage: ledger behind the per-user daily cap on OpenAI calls.
-- The cap used to count `captures`, which owners can delete or backdate through the Data API,
-- and extraction re-runs on an existing capture were never counted. This table has no grants
-- for anon/authenticated; only the Edge Functions (service role) reach it, via consume_ai_quota.
-- ---------------------------------------------------------------------------------------------
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('transcribe', 'extract')),
  created_at timestamptz not null default now()
);

create index ai_usage_user_kind_created on public.ai_usage (user_id, kind, created_at desc);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select, insert on public.ai_usage to service_role;

-- Records one call and returns true, or returns false when the user already made `p_cap` calls of
-- this kind in the last 24 hours. Check and insert run under a per-user lock, so parallel requests
-- can't all pass the check before any of them is recorded.
create function public.consume_ai_quota(p_user_id uuid, p_kind text, p_cap integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user_id::text || ':' || p_kind, 0));
  select count(*) into used
    from public.ai_usage
    where user_id = p_user_id and kind = p_kind and created_at > now() - interval '24 hours';
  if used >= p_cap then
    return false;
  end if;
  insert into public.ai_usage (user_id, kind) values (p_user_id, p_kind);
  return true;
end;
$$;

revoke execute on function public.consume_ai_quota(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------------------------
-- google_tokens: server-only. The google-token function now uses the service role, so a stolen
-- user JWT can no longer read the long-lived Google refresh token through the Data API.
-- ---------------------------------------------------------------------------------------------
drop policy owner_all on public.google_tokens;
revoke all on public.google_tokens from anon, authenticated;
grant select, insert, update, delete on public.google_tokens to service_role;
