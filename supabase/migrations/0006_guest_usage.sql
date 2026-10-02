-- Guest (not logged in) questions per IST day. Limits in lib/plans.ts (GUEST).
-- key = "g:<cookie id>" or "ip:<sha256 of IP>". Server (service role) only.
create table if not exists guest_usage (
  key text not null,
  day date not null,
  questions int not null default 0,
  photos int not null default 0,
  primary key (key, day)
);

alter table guest_usage enable row level security;

-- 0 = ok (counted), 1 = question limit, 2 = photo limit.
create or replace function use_guest(
  p_guest text, p_ip text, p_day date,
  p_limit int, p_ip_limit int, p_photo boolean, p_photo_limit int
) returns int
language plpgsql as $$
declare
  g guest_usage%rowtype;
  ip_used int;
begin
  -- Serialize parallel requests of the same guest.
  perform pg_advisory_xact_lock(hashtext(p_guest));

  select * into g from guest_usage where key = p_guest and day = p_day;
  select coalesce(questions, 0) into ip_used
    from guest_usage where key = p_ip and day = p_day;

  if coalesce(g.questions, 0) >= p_limit or coalesce(ip_used, 0) >= p_ip_limit then
    return 1;
  end if;
  if p_photo and coalesce(g.photos, 0) >= p_photo_limit then return 2; end if;

  insert into guest_usage (key, day, questions, photos)
  values (p_guest, p_day, 1, case when p_photo then 1 else 0 end),
         (p_ip, p_day, 1, case when p_photo then 1 else 0 end)
  on conflict (key, day) do update set
    questions = guest_usage.questions + 1,
    photos = guest_usage.photos + excluded.photos;
  return 0;
end $$;

-- Give a question back (model error / not a real answer).
create or replace function refund_guest(
  p_guest text, p_ip text, p_day date, p_photo boolean
) returns void
language sql as $$
  update guest_usage set
    questions = greatest(questions - 1, 0),
    photos = greatest(photos - case when p_photo then 1 else 0 end, 0)
  where key in (p_guest, p_ip) and day = p_day;
$$;

revoke execute on function use_guest(text, text, date, int, int, boolean, int) from public, anon, authenticated;
revoke execute on function refund_guest(text, text, date, boolean) from public, anon, authenticated;
