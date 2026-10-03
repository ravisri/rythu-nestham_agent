import { AI_PROVIDERS, type AiProvider } from "@/lib/ai-models"
import { decrypt } from "@/lib/secrets"
import { getSupabase } from "@/lib/supabase"

// Admin-managed model + API key overrides (/admin/ai), stored in ai_settings
// (supabase/migrations/0004_ai_settings.sql). Server-only: holds plain API keys.
// Anything not set here falls back to .env.local, then to the built-in default.

export type AiSettings = {
  chatModel?: string
  ocrModel?: string
  // Guests (not logged in) use this, ideally a free model; empty = chat model.
  guestModel?: string
  // Optional daily token budget for all guests together; empty = no limit.
  guestDailyTokens?: number
  compatBaseUrl?: string
  apiKeys: Partial<Record<AiProvider, string>>
  // Saved keys that could not be decrypted (AI_SETTINGS_SECRET changed).
  unreadable: AiProvider[]
}

export type AiSettingsRow = {
  chat_model: string | null
  ocr_model: string | null
  guest_model?: string | null // migration 0007
  guest_daily_tokens?: number | null
  compat_base_url: string | null
  api_keys: Partial<Record<AiProvider, string>> | null
}

const EMPTY: AiSettings = { apiKeys: {}, unreadable: [] }

// Other server instances see a change within TTL; the saving one at once.
const TTL_MS = 30_000
let cache: { at: number; value: Promise<AiSettings> } | undefined

export async function readSettingsRow(): Promise<AiSettingsRow | null> {
  const { data, error } = await getSupabase()
    .from("ai_settings")
    .select("*") // "*": works before and after migration 0007
    .eq("id", 1)
    .maybeSingle()
  if (error) throw error
  return data
}

async function load(): Promise<AiSettings> {
  try {
    const row = await readSettingsRow()
    if (!row) return EMPTY
    const apiKeys: AiSettings["apiKeys"] = {}
    const unreadable: AiProvider[] = []
    for (const provider of AI_PROVIDERS) {
      const blob = row.api_keys?.[provider]
      if (!blob) continue
      const value = decrypt(blob)
      if (value) apiKeys[provider] = value
      else unreadable.push(provider)
    }
    return {
      chatModel: row.chat_model ?? undefined,
      ocrModel: row.ocr_model ?? undefined,
      guestModel: row.guest_model ?? undefined,
      guestDailyTokens: row.guest_daily_tokens ?? undefined,
      compatBaseUrl: row.compat_base_url ?? undefined,
      apiKeys,
      unreadable,
    }
  } catch (error) {
    // Table not migrated yet / Supabase down: keep working on .env values.
    console.error(
      "AI settings unavailable, using env:",
      (error as Error).message
    )
    return EMPTY
  }
}

export function getAiSettings(): Promise<AiSettings> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    cache = { at: Date.now(), value: load() }
  }
  return cache.value
}

export function invalidateAiSettings() {
  cache = undefined
}
