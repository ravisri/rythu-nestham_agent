-- "Next question" suggestions shown per IST day (limits: lib/plans.ts). Safe to re-run.
alter table usage_daily add column if not exists suggestions int not null default 0;
alter table guest_usage add column if not exists suggestions int not null default 0;

create or replace function add_user_suggestion(p_user uuid, p_day date)
returns void
language sql as $$
  insert into usage_daily (user_id, day, suggestions) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set suggestions = usage_daily.suggestions + 1;
$$;

create or replace function add_guest_suggestion(p_guest text, p_day date)
returns void
language sql as $$
  update guest_usage set suggestions = suggestions + 1
  where key = p_guest and day = p_day;
$$;

revoke execute on function add_user_suggestion(uuid, date) from public, anon, authenticated;
revoke execute on function add_guest_suggestion(text, date) from public, anon, authenticated;
