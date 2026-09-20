import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | undefined

// Server-only (service-role key). Never import from a client component.
// Lazy so the app still runs (without RAG) when Supabase env vars are missing.
export function getSupabase(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    )
  }

  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}
