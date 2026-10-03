-- Bring Your Own (Google) Key: after the app's free quota, a user can continue
-- on their own Gemini key (limit: lib/plans.ts BYOK). Safe to re-run.

create table if not exists user_api_keys (
  user_id uuid primary key references app_users (id) on delete cascade,
  google_key text not null, -- AES-256-GCM, encrypted by lib/secrets.ts
  updated_at timestamptz not null default now()
);
alter table user_api_keys enable row level security; -- service role only

alter table usage_daily add column if not exists byok_requests int not null default 0;

-- Admin's Gemini model for user keys (users can't pick a model).
alter table ai_settings add column if not exists byok_model text;

-- Count one own-key question if today's cap allows it (row lock like use_credits).
create or replace function use_byok(p_user uuid, p_day date, p_limit int)
returns boolean
language plpgsql as $$
declare
  used int;
begin
  perform 1 from app_users where id = p_user for update;
  select coalesce(byok_requests, 0) into used
    from usage_daily where user_id = p_user and day = p_day;
  if coalesce(used, 0) >= p_limit then return false; end if;
  insert into usage_daily (user_id, day, byok_requests) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set byok_requests = usage_daily.byok_requests + 1;
  return true;
end $$;

create or replace function refund_byok(p_user uuid, p_day date)
returns void
language sql as $$
  update usage_daily set byok_requests = greatest(byok_requests - 1, 0)
  where user_id = p_user and day = p_day;
$$;

revoke execute on function use_byok(uuid, date, int) from public, anon, authenticated;
revoke execute on function refund_byok(uuid, date) from public, anon, authenticated;
