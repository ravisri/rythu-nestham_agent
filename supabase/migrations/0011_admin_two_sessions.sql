-- Admins may stay logged in on 2 devices: the second-newest admin session lives
-- here (farmers keep one device; this stays null for them). A 3rd admin login
-- moves the newest into this slot and drops the oldest. See lib/auth.ts.
alter table app_users add column if not exists prev_session_token_hash text unique;
