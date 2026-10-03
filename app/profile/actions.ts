"use server"

import { revalidatePath } from "next/cache"
import { APICallError } from "ai"
import { byokModelId, testModel } from "@/lib/ai"
import { getAiSettings } from "@/lib/ai-settings"
import { getCurrentUser } from "@/lib/auth"
import { mask } from "@/lib/secrets"
import { isQuotaError } from "@/lib/token-usage"
import { deleteUserGoogleKey, saveUserGoogleKey } from "@/lib/user-keys"
import { userApiKeySchema, type UserApiKeyValues } from "@/lib/validation"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const NOT_LOGGED_IN = "మళ్లీ లాగిన్ అవ్వండి."
const SAVE_FAILED = "సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి."
const KEY_WRONG = "ఈ API కీ పని చేయడం లేదు. సరిగ్గా కాపీ చేశారో చూడండి."
const NO_TABLE =
  "user_api_keys టేబుల్ లేదు. supabase/migrations/0009_user_api_keys.sql రన్ చేయండి."

// Tests the key with the admin's Gemini model, then stores it encrypted.
export async function saveMyApiKey(
  values: UserApiKeyValues
): Promise<Result<{ masked: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: NOT_LOGGED_IN }
  const parsed = userApiKeySchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? KEY_WRONG }
  }
  const { apiKey } = parsed.data

  try {
    const settings = await getAiSettings()
    await testModel(byokModelId(settings), { apiKeys: { google: apiKey } })
  } catch (error) {
    // Out of quota still proves the key is real: save it.
    const status = APICallError.isInstance(error) ? error.statusCode : undefined
    if (!isQuotaError(error) || status === 400) {
      return { ok: false, error: KEY_WRONG }
    }
  }

  try {
    await saveUserGoogleKey(user.id, apiKey)
  } catch (error) {
    console.error("saveMyApiKey failed:", error)
    const missing = /PGRST205|42P01|user_api_keys/.test(JSON.stringify(error))
    return { ok: false, error: missing ? NO_TABLE : SAVE_FAILED }
  }
  revalidatePath("/profile")
  return { ok: true, masked: mask(apiKey) }
}

export async function deleteMyApiKey(): Promise<Result> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: NOT_LOGGED_IN }
  try {
    await deleteUserGoogleKey(user.id)
  } catch (error) {
    console.error("deleteMyApiKey failed:", error)
    return { ok: false, error: SAVE_FAILED }
  }
  revalidatePath("/profile")
  return { ok: true }
}
