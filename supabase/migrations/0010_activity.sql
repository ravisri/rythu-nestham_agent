-- Daily activity for the admin (/admin/usage): counts only, aggregated from the
-- existing guest_usage / usage_daily rows. No question text or photos are stored.
-- Guest detail rows older than the previous month are purged by the app
-- (lib/activity.ts), so guest_usage no longer grows forever.

-- Per IST day: active guests / signed-in users and their requests.
-- user requests = credits - photos (a photo question costs 2 credits)
--                 + questions answered on the user's own API key.
create or replace function activity_by_day(p_from date)
returns table (
  day date,
  guests int,
  guest_requests int,
  users int,
  user_requests int
)
language sql stable as $$
  with g as (
    select day, count(*)::int as guests, sum(questions)::int as guest_requests
    from guest_usage
    where key like 'g:%' and day >= p_from and questions > 0
    group by day
  ),
  u as (
    select day,
      count(*)::int as users,
      sum(greatest(credits - photos, 0) + byok_requests)::int as user_requests
    from usage_daily
    where day >= p_from and (credits > 0 or byok_requests > 0)
    group by day
  )
  select coalesce(g.day, u.day) as day,
    coalesce(g.guests, 0), coalesce(g.guest_requests, 0),
    coalesce(u.users, 0), coalesce(u.user_requests, 0)
  from g full join u on g.day = u.day
  order by 1 desc;
$$;

-- Deletes guest detail rows before p_before; returns how many were removed.
create or replace function purge_guest_usage(p_before date)
returns int
language sql as $$
  with gone as (delete from guest_usage where day < p_before returning 1)
  select count(*)::int from gone;
$$;

revoke execute on function activity_by_day(date) from public, anon, authenticated;
revoke execute on function purge_guest_usage(date) from public, anon, authenticated;
