// Upload a Supabase CSV export into Neon Postgres.
//   npm run upload:neon                          crop_knowledge (Downloads\crop_knowledge_rows.csv)
//   npm run upload:neon -- app_users             app_users      (Downloads\app_users_rows.csv)
//   npm run upload:neon -- ai_settings           ai_settings    (Downloads\ai_settings_rows.csv)
//   npm run upload:neon -- <table> <path.csv>    any supported table from another file
//   npm run upload:neon -- <path.csv>            crop_knowledge from another file
// Needs DATABASE_URL (Neon connection string) in .env.local — never put the
// password in this file. Safe to run again: existing ids are skipped, so no
// duplicates. The app reads Neon via lib/db.ts.
import fs from "node:fs"
import path from "node:path"
import { parse } from "csv-parse"
import pg from "pg"

const BATCH = 100

// Empty CSV field -> NULL.
const text = (v) => (v === "" || v === undefined ? null : v)
const int = (v) => (text(v) === null ? null : Number(v))
// Supabase exports text[] as a JSON array: ["a","b"] -> JS array (pg sends text[]).
const textArray = (v) => (text(v) === null ? [] : JSON.parse(v))

const TABLES = {
  crop_knowledge: {
    file: "crop_knowledge_rows.csv",
    columns: { id: text, content: text, metadata: text, embedding: text },
    casts: { metadata: "jsonb", embedding: "vector" },
    // Vector extension, table, indexes, match_crop_knowledge (all idempotent).
    setup: () =>
      ["0001_init_pgvector.sql", "0002_crop_filter.sql"].map((f) =>
        fs.readFileSync(path.join("supabase", "migrations", f), "utf8")
      ),
    check: `select count(*)::int as total,
              count(*) filter (where vector_dims(embedding) = 768)::int as ok_vectors
            from crop_knowledge`,
  },
  app_users: {
    file: "app_users_rows.csv",
    columns: {
      id: text, username: text, phone: text, password_hash: text, role: text,
      plan: text, trial_ends_at: text, plan_expires_at: text,
      recovery_code_hash: text, session_token_hash: text,
      trusted_devices: textArray, failed_logins: int, locked_until: text,
      reset_count: int, reset_day: text, created_at: text,
      prev_session_token_hash: text,
    },
    casts: {},
    // Same as supabase/migrations/0003 + 0011 (without Supabase-only roles).
    setup: () => [
      `create table if not exists app_users (
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
      alter table app_users add column if not exists prev_session_token_hash text unique;
      alter table app_users enable row level security;`,
    ],
    check: `select count(*)::int as total,
              count(*) filter (where role = 'admin')::int as admins
            from app_users`,
  },
  // Single settings row (id = 1). Upload app_users first: updated_by points there.
  ai_settings: {
    file: "ai_settings_rows.csv",
    columns: {
      id: int, chat_model: text, ocr_model: text, compat_base_url: text,
      api_keys: (v) => text(v) ?? "{}", updated_by: text, updated_at: text,
      guest_model: text, guest_daily_tokens: int, byok_model: text,
    },
    casts: { api_keys: "jsonb" },
    // Same as supabase/migrations/0004 + 0007 + 0009 (without Supabase-only roles).
    setup: () => [
      `create table if not exists ai_settings (
        id int primary key default 1 check (id = 1),
        chat_model text,
        ocr_model text,
        compat_base_url text,
        api_keys jsonb not null default '{}',
        updated_by uuid references app_users (id) on delete set null,
        updated_at timestamptz not null default now()
      );
      alter table ai_settings add column if not exists guest_model text;
      alter table ai_settings add column if not exists guest_daily_tokens int;
      alter table ai_settings add column if not exists byok_model text;
      alter table ai_settings enable row level security;`,
    ],
    check: `select count(*)::int as total, max(chat_model) as chat_model
            from ai_settings`,
  },
}

// Args: [table] [csv]. A lone .csv path means crop_knowledge (old usage).
const args = process.argv.slice(2)
const tableName = args[0] && !args[0].toLowerCase().endsWith(".csv") ? args.shift() : "crop_knowledge"
const table = TABLES[tableName]
if (!table) {
  console.error(`Unknown table "${tableName}". Supported: ${Object.keys(TABLES).join(", ")}`)
  process.exit(1)
}
const csvFile = args[0] ?? path.join(process.env.USERPROFILE ?? "", "Downloads", table.file)

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add your Neon connection string to .env.local.")
  process.exit(1)
}
if (!fs.existsSync(csvFile)) {
  console.error(`CSV not found: ${csvFile}`)
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
const names = Object.keys(table.columns)

// One multi-row INSERT per batch; ids already in Neon are left as they are.
async function insertBatch(rows) {
  const values = []
  const params = []
  rows.forEach((row, i) => {
    values.push(
      `(${names
        .map((name, j) => {
          const cast = table.casts[name]
          return `$${i * names.length + j + 1}${cast ? `::${cast}` : ""}`
        })
        .join(", ")})`
    )
    for (const name of names) params.push(table.columns[name](row[name]))
  })
  const result = await client.query(
    `insert into ${tableName} (${names.join(", ")})
     values ${values.join(", ")}
     on conflict (id) do nothing`,
    params
  )
  return result.rowCount ?? 0
}

async function main() {
  await client.connect()
  console.log(`Connected to Neon. Table: ${tableName}`)
  for (const sql of table.setup()) await client.query(sql)
  console.log(`Table ${tableName} ready.`)

  const parser = fs
    .createReadStream(csvFile)
    .pipe(parse({ columns: true, skip_empty_lines: true }))

  let read = 0
  let inserted = 0
  let batch = []
  const flush = async () => {
    if (batch.length === 0) return
    // All-or-nothing per batch: a bad row stops the run instead of being skipped.
    await client.query("begin")
    try {
      inserted += await insertBatch(batch)
      await client.query("commit")
    } catch (error) {
      await client.query("rollback")
      throw new Error(`Batch ending at row ${read} failed: ${error.message}`)
    }
    console.log(`  ${read} rows processed (${inserted} new)`)
    batch = []
  }

  for await (const row of parser) {
    read++
    batch.push(row)
    if (batch.length === BATCH) await flush()
  }
  await flush()

  const { rows } = await client.query(table.check)
  console.log(
    `\nDone. CSV rows: ${read} | inserted: ${inserted} | already there: ${read - inserted}`
  )
  console.log(`Neon ${tableName}:`, rows[0])
}

main()
  .catch((error) => {
    console.error("Upload failed:", error.message)
    process.exitCode = 1
  })
  .finally(() => client.end())
