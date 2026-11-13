// Server-only Neon Postgres (pgvector) access via DATABASE_URL. HTTP driver:
// one round trip per query, no pooled connections to manage (serverless-safe).
// Used by the app and by the scripts (npm run ingest / create-admin / lexicon).
import { neon, types, type NeonQueryFunction } from "@neondatabase/serverless"

const DATE = 1082
const TIMESTAMP = 1114
const TIMESTAMPTZ = 1184

// Same shapes the code used before: dates as "yyyy-mm-dd", timestamps as ISO
// strings (not Date objects). bigint / count(*) stay strings: cast ::int or Number().
// Set on the driver's global registry: neon() ignores a `types` option for
// tagged-template queries.
for (const id of [TIMESTAMP, TIMESTAMPTZ]) {
  const toDate = types.getTypeParser(id) as (v: string) => Date
  types.setTypeParser(id, (v: string) => toDate(v).toISOString())
}
types.setTypeParser(DATE, (v: string) => v)

let client: NeonQueryFunction<false, false> | undefined

// sql`select ... where id = ${id}` -> rows (values are always sent as parameters).
export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is not set (Neon connection string)")
    client = neon(url)
  }
  return client
}

// Postgres error code (e.g. "23505" unique violation), if any.
export const pgCode = (error: unknown) =>
  (error as { code?: string } | null)?.code

// pgvector literal: [0.1,0.2,...]
export const toVector = (values: number[]) => JSON.stringify(values)
