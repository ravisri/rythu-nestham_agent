-- Admin-managed LLM settings (/admin/ai). One row only. Server-only like
-- app_users: RLS on with no policies, so only the service-role key can access it.
-- API keys are AES-256-GCM encrypted by lib/secrets.ts before they reach the DB.
-- Empty values fall back to .env.local (CHAT_MODEL, GOOGLE_GENERATIVE_AI_API_KEY, ...).

create table if not exists ai_settings (
  id int primary key default 1 check (id = 1),
  chat_model text,        -- "provider:model", null = env/default
  ocr_model text,
  compat_base_url text,
  api_keys jsonb not null default '{}', -- { google | openai | anthropic | compat: "v1...." }
  updated_by uuid references app_users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table ai_settings enable row level security;
