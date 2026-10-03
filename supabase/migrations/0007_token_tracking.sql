-- Token tracking + guest model controls (/admin/usage, /admin/ai). Safe to re-run.

-- Separate (free) model for guests, and an optional daily token budget for them.
alter table ai_settings add column if not exists guest_model text;
alter table ai_settings add column if not exists guest_daily_tokens int;

-- Tokens per guest per day (questions/photos already counted by use_guest).
alter table guest_usage add column if not exists tokens_in bigint not null default 0;
alter table guest_usage add column if not exists tokens_out bigint not null default 0;

-- Every AI call, per IST day, model and audience ('user' | 'guest').
create table if not exists model_usage (
  day date not null,
  model text not null,
  audience text not null check (audience in ('user', 'guest')),
  requests int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  errors int not null default 0,
  quota_errors int not null default 0, -- 429 / quota / out of credits
  last_error_at timestamptz,
  primary key (day, model, audience)
);

alter table model_usage enable row level security;

create or replace function add_model_usage(
  p_day date, p_model text, p_audience text,
  p_in bigint, p_out bigint, p_error boolean, p_quota boolean
) returns void
language sql as $$
  insert into model_usage as m
    (day, model, audience, requests, tokens_in, tokens_out, errors, quota_errors, last_error_at)
  values (
    p_day, p_model, p_audience, 1, p_in, p_out,
    case when p_error then 1 else 0 end,
    case when p_quota then 1 else 0 end,
    case when p_error then now() end
  )
  on conflict (day, model, audience) do update set
    requests = m.requests + 1,
    tokens_in = m.tokens_in + excluded.tokens_in,
    tokens_out = m.tokens_out + excluded.tokens_out,
    errors = m.errors + excluded.errors,
    quota_errors = m.quota_errors + excluded.quota_errors,
    last_error_at = coalesce(excluded.last_error_at, m.last_error_at);
$$;

create or replace function add_guest_tokens(
  p_guest text, p_day date, p_in bigint, p_out bigint
) returns void
language sql as $$
  update guest_usage set
    tokens_in = tokens_in + p_in,
    tokens_out = tokens_out + p_out
  where key = p_guest and day = p_day;
$$;

revoke execute on function add_model_usage(date, text, text, bigint, bigint, boolean, boolean) from public, anon, authenticated;
revoke execute on function add_guest_tokens(text, date, bigint, bigint) from public, anon, authenticated;
