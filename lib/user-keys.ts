// Server-only: users' own Google (Gemini) API keys, used after the app's quota.
// Keys are AES-GCM encrypted (lib/secrets.ts) and never sent back in full.
import { db } from "@/lib/db"
import { BYOK, istDay } from "@/lib/plans"
import { decrypt, encrypt } from "@/lib/secrets"

// Decrypted key, or undefined (none saved / unreadable / DB error).
export async function getUserGoogleKey(
  userId: string
): Promise<string | undefined> {
  const rows = await db()`
    select google_key from user_api_keys where user_id = ${userId}::uuid`.catch(
    () => null
  )
  if (!rows?.[0]) return undefined
  return decrypt(rows[0].google_key as string)
}

export async function saveUserGoogleKey(userId: string, key: string) {
  await db()`
    insert into user_api_keys (user_id, google_key, updated_at)
    values (${userId}::uuid, ${encrypt(key)}, now())
    on conflict (user_id) do update
      set google_key = excluded.google_key, updated_at = excluded.updated_at`
}

export async function deleteUserGoogleKey(userId: string) {
  await db()`delete from user_api_keys where user_id = ${userId}::uuid`
}

// One own-key question against today's cap. Fails closed on a DB error.
export async function chargeByok(userId: string): Promise<boolean> {
  try {
    const [{ ok }] = await db()`
      select use_byok(${userId}::uuid, ${istDay()}::date, ${BYOK.daily}::int) as ok`
    return ok === true
  } catch (error) {
    console.error("chargeByok failed:", error)
    return false
  }
}

export async function refundByok(userId: string) {
  await db()`select refund_byok(${userId}::uuid, ${istDay()}::date)`.catch(
    (error) => console.error("refundByok failed:", error)
  )
}
