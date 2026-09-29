-- Accounts, plans and daily credit usage. Server-only: RLS is on with no
-- policies, so only the service-role key (lib/supabase.ts) can read/write.
-- First admin: update app_users set role = 'admin' where username = '<name>';

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  phone text unique check (phone ~ '^[6-9][0-9]{9}$'),
  password_hash text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  plan text not null default 'trial' check (plan in ('trial', 'pro', 'pro_plus')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  plan_expires_at timestamptz,
  recovery_code_hash text,
  session_token_hash text unique,
  trusted_devices text[] not null default '{}',
  failed_logins int not null default 0,
  locked_until timestamptz,
  reset_count int not null default 0,
  reset_day date,
  created_at timestamptz not null default now()
);

create table if not exists usage_daily (
  user_id uuid not null references app_users (id) on delete cascade,
  day date not null,
  credits int not null default 0,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  primary key (user_id, day)
);

alter table app_users enable row level security;
alter table usage_daily enable row level security;

-- Charge credits if both limits allow it. 0 = ok, 1 = daily limit, 2 = period limit.
-- Locks the user row so two parallel requests can't both pass the check.
create or replace function use_credits(
  p_user uuid, p_day date, p_cost int,
  p_daily_limit int, p_period_limit int, p_period_start date
) returns int
language plpgsql as $$
declare
  used_today int;
  used_period int;
begin
  perform 1 from app_users where id = p_user for update;

  select coalesce(sum(credits), 0) into used_today
    from usage_daily where user_id = p_user and day = p_day;
  select coalesce(sum(credits), 0) into used_period
    from usage_daily where user_id = p_user and day >= p_period_start;

  if used_today + p_cost > p_daily_limit then return 1; end if;
  if used_period + p_cost > p_period_limit then return 2; end if;

  insert into usage_daily (user_id, day, credits) values (p_user, p_day, p_cost)
  on conflict (user_id, day) do update set credits = usage_daily.credits + p_cost;
  return 0;
end $$;

-- Record tokens after a reply, or refund credits (negative delta) after an error.
create or replace function add_usage(
  p_user uuid, p_day date, p_credits int, p_tokens_in int, p_tokens_out int
) returns void
language sql as $$
  insert into usage_daily (user_id, day, credits, tokens_in, tokens_out)
  values (p_user, p_day, greatest(p_credits, 0), p_tokens_in, p_tokens_out)
  on conflict (user_id, day) do update set
    credits = greatest(usage_daily.credits + p_credits, 0),
    tokens_in = usage_daily.tokens_in + p_tokens_in,
    tokens_out = usage_daily.tokens_out + p_tokens_out;
$$;

-- Functions are only for the server.
revoke execute on function use_credits(uuid, date, int, int, int, date) from public, anon, authenticated;
revoke execute on function add_usage(uuid, date, int, int, int) from public, anon, authenticated;
