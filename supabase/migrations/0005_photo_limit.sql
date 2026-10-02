-- Daily photo limit per plan (limits in lib/plans.ts, PLANS.*.photosDaily).
alter table usage_daily add column if not exists photos int not null default 0;

-- Count one photo if today's limit allows it. Locks the user row like use_credits.
create or replace function use_photo(p_user uuid, p_day date, p_limit int)
returns boolean
language plpgsql as $$
declare
  used int;
begin
  perform 1 from app_users where id = p_user for update;

  select coalesce(photos, 0) into used
    from usage_daily where user_id = p_user and day = p_day;
  if coalesce(used, 0) >= p_limit then return false; end if;

  insert into usage_daily (user_id, day, photos) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set photos = usage_daily.photos + 1;
  return true;
end $$;

-- Give the photo back (no answer / not a farm photo / credit limit hit).
create or replace function refund_photo(p_user uuid, p_day date)
returns void
language sql as $$
  update usage_daily set photos = greatest(photos - 1, 0)
  where user_id = p_user and day = p_day;
$$;

-- Functions are only for the server.
revoke execute on function use_photo(uuid, date, int) from public, anon, authenticated;
revoke execute on function refund_photo(uuid, date) from public, anon, authenticated;
