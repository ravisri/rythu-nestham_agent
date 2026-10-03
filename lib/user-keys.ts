// Server-only: users' own Google (Gemini) API keys, used after the app's quota.
// Keys are AES-GCM encrypted (lib/secrets.ts) and never sent back in full.
import { BYOK, istDay } from "@/lib/plans"
import { decrypt, encrypt } from "@/lib/secrets"
import { getSupabase } from "@/lib/supabase"

// Decrypted key, or undefined (none saved / unreadable / table missing).
export async function getUserGoogleKey(
  userId: string
): Promise<string | undefined> {
  const { data, error } = await getSupabase()
    .from("user_api_keys")
    .select("google_key")
    .eq("user_id", userId)
    .maybeSingle()
  if (error || !data) return undefined
  return decrypt(data.google_key as string)
}

export async function saveUserGoogleKey(userId: string, key: string) {
  const { error } = await getSupabase()
    .from("user_api_keys")
    .upsert({
      user_id: userId,
      google_key: encrypt(key),
      updated_at: new Date().toISOString(),
    })
  if (error) throw error
}

export async function deleteUserGoogleKey(userId: string) {
  const { error } = await getSupabase()
    .from("user_api_keys")
    .delete()
    .eq("user_id", userId)
  if (error) throw error
}

// One own-key question against today's cap. Fails closed (DB not migrated).
export async function chargeByok(userId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("use_byok", {
    p_user: userId,
    p_day: istDay(),
    p_limit: BYOK.daily,
  })
  if (error) {
    console.error("chargeByok failed:", error)
    return false
  }
  return data === true
}

export async function refundByok(userId: string) {
  const { error } = await getSupabase().rpc("refund_byok", {
    p_user: userId,
    p_day: istDay(),
  })
  if (error) console.error("refundByok failed:", error)
}
