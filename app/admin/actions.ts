"use server"

import { revalidatePath } from "next/cache"
import { APICallError } from "ai"
import { testModel } from "@/lib/ai"
import { AI_PROVIDERS, type AiProvider } from "@/lib/ai-models"
import {
  getAiSettings,
  invalidateAiSettings,
  readSettingsRow,
} from "@/lib/ai-settings"
import {
  getCurrentUser,
  hashSecret,
  newRecoveryCode,
  type AppUser,
} from "@/lib/auth"
import { encrypt } from "@/lib/secrets"
import { getSupabase } from "@/lib/supabase"
import {
  adminCreateSchema,
  adminPasswordSchema,
  adminPlanSchema,
  adminUserIdSchema,
  aiSettingsSchema,
  aiTestSchema,
  type AdminCreateValues,
  type AdminPasswordValues,
  type AdminPlanValues,
  type AdminUserIdValues,
  type AiSettingsValues,
  type AiTestValues,
} from "@/lib/validation"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const INVALID = "సమాచారం సరిగా లేదు."
const FAILED = "సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి."
const NOT_ALLOWED = "అనుమతి లేదు."

// Every action re-checks the caller: Server Actions are public endpoints.
async function asAdmin<T>(
  fn: (me: AppUser) => Promise<Result<T>>
): Promise<Result<T>> {
  const me = await getCurrentUser()
  if (me?.role !== "admin") return { ok: false, error: NOT_ALLOWED }
  try {
    const result = await fn(me)
    // "layout" also refreshes /admin/ai.
    if (result.ok) revalidatePath("/admin", "layout")
    return result
  } catch (error) {
    console.error(error)
    return { ok: false, error: FAILED }
  }
}

// Clears login lockout and today's "forgot password" attempts, so a user
// helped by the admin can sign in / reset again the same day.
const UNLOCK = {
  failed_logins: 0,
  locked_until: null,
  reset_count: 0,
  reset_day: null,
}

// yyyy-mm-dd -> end of that day in India
const endOfDayIst = (day: string) => `${day}T23:59:59+05:30`

export async function createUser(
  values: AdminCreateValues
): Promise<Result<{ recoveryCode: string }>> {
  const parsed = adminCreateSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: INVALID }
  const { username, phone, password, plan } = parsed.data

  return asAdmin<{ recoveryCode: string }>(async () => {
    const recoveryCode = newRecoveryCode()
    const { error } = await getSupabase()
      .from("app_users")
      .insert({
        username,
        phone: phone || null,
        plan,
        password_hash: await hashSecret(password),
        recovery_code_hash: await hashSecret(recoveryCode),
      })
    if (error?.code === "23505") {
      return {
        ok: false,
        error: error.message.includes("phone")
          ? "ఈ ఫోన్ నంబర్‌తో ఇప్పటికే ఖాతా ఉంది."
          : "ఈ యూజర్‌నేమ్ ఇప్పటికే ఉంది.",
      }
    }
    if (error) throw error
    return { ok: true, recoveryCode }
  })
}

export async function updatePlan(values: AdminPlanValues): Promise<Result> {
  const parsed = adminPlanSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: INVALID }
  const { userId, plan, expiresOn } = parsed.data

  return asAdmin<object>(async () => {
    const until = expiresOn ? endOfDayIst(expiresOn) : null
    const { error } = await getSupabase()
      .from("app_users")
      .update(
        plan === "trial"
          ? { plan, ...(until && { trial_ends_at: until }) }
          : { plan, plan_expires_at: until }
      )
      .eq("id", userId)
    if (error) throw error
    return { ok: true }
  })
}

// Sets a new password + recovery code and signs the user out everywhere.
export async function resetUserPassword(
  values: AdminPasswordValues
): Promise<Result<{ recoveryCode: string }>> {
  const parsed = adminPasswordSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: INVALID }
  const { userId, password } = parsed.data

  return asAdmin<{ recoveryCode: string }>(async () => {
    const recoveryCode = newRecoveryCode()
    const { error } = await getSupabase()
      .from("app_users")
      .update({
        password_hash: await hashSecret(password),
        recovery_code_hash: await hashSecret(recoveryCode),
        session_token_hash: null,
        ...UNLOCK,
      })
      .eq("id", userId)
    if (error) throw error
    return { ok: true, recoveryCode }
  })
}

// Lost password AND recovery code: a new code only. The admin never knows the
// password; the user sets it via "forgot password" with this code. The old
// code stops working; password and sessions are unchanged.
export async function issueRecoveryCode(
  values: AdminUserIdValues
): Promise<Result<{ recoveryCode: string }>> {
  const parsed = adminUserIdSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: INVALID }

  return asAdmin<{ recoveryCode: string }>(async () => {
    const recoveryCode = newRecoveryCode()
    const { error } = await getSupabase()
      .from("app_users")
      .update({ recovery_code_hash: await hashSecret(recoveryCode), ...UNLOCK })
      .eq("id", parsed.data.userId)
    if (error) throw error
    return { ok: true, recoveryCode }
  })
}

// "google" + "google:gemini-x" -> "google:gemini-x" (tolerates a pasted prefix)
const modelId = (provider: AiProvider, model: string) =>
  `${provider}:${model.startsWith(`${provider}:`) ? model.slice(provider.length + 1) : model}`

// Missing table = migration 0004 not run yet.
const NO_TABLE =
  "ai_settings టేబుల్ లేదు. supabase/migrations/0004_ai_settings.sql రన్ చేయండి."
const isMissingTable = (error: unknown) =>
  /PGRST205|42P01|ai_settings/.test(JSON.stringify(error))
// Guest model columns missing = migration 0007 not run yet.
const NO_GUEST_COLUMNS =
  "గెస్ట్ మోడల్ కాలమ్స్ లేవు. supabase/migrations/0007_token_tracking.sql రన్ చేయండి."
const isMissingColumn = (error: unknown) =>
  /PGRST204|42703|guest_/.test(JSON.stringify(error))

// Saves models + encrypted API keys. Empty key fields keep the saved key.
export async function saveAiSettings(values: AiSettingsValues): Promise<Result> {
  const parsed = aiSettingsSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: INVALID }
  const d = parsed.data

  return asAdmin<object>(async (me) => {
    let row
    try {
      row = await readSettingsRow()
    } catch (error) {
      if (isMissingTable(error)) return { ok: false, error: NO_TABLE }
      throw error
    }

    const keys = { ...(row?.api_keys ?? {}) }
    for (const provider of d.clearKeys) delete keys[provider]
    for (const provider of AI_PROVIDERS) {
      const key = d.apiKeys[provider]
      if (key) keys[provider] = encrypt(key)
    }

    const { error } = await getSupabase()
      .from("ai_settings")
      .upsert({
        id: 1,
        chat_model: modelId(d.chatProvider, d.chatModel),
        ocr_model: modelId(d.ocrProvider, d.ocrModel),
        guest_model: modelId(d.guestProvider, d.guestModel),
        guest_daily_tokens: d.guestDailyTokens ? Number(d.guestDailyTokens) : null,
        compat_base_url: d.compatBaseUrl || null,
        api_keys: keys,
        updated_by: me.id,
        updated_at: new Date().toISOString(),
      })
    if (error && isMissingColumn(error)) return { ok: false, error: NO_GUEST_COLUMNS }
    if (error) throw error
    invalidateAiSettings()
    return { ok: true }
  })
}

// Telugu reason only: provider error text can echo request details.
function testError(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined
  const text = String(error)
  if (status === 401 || status === 403 || /api.?key|unauthori[sz]ed|permission/i.test(text)) {
    return "API కీ సరైనది కాదు లేదా ఇవ్వలేదు."
  }
  if (status === 404 || /not.?found|does not exist/i.test(text)) {
    return "ఈ మోడల్ పేరు తప్పు లేదా ఈ కీకి అందుబాటులో లేదు."
  }
  if (status === 429 || /quota|rate|RESOURCE_EXHAUSTED/i.test(text)) {
    return "కీ పని చేస్తోంది, కానీ కోటా / రేట్ పరిమితి దాటింది."
  }
  if (/COMPAT_BASE_URL|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(text)) {
    return "Base URL చేరుకోలేకపోయాం. URL సరిచూడండి."
  }
  return "కనెక్ట్ కాలేదు. ప్రొవైడర్, మోడల్, కీ సరిచూడండి."
}

// One tiny model call. Uses the typed key, else the saved key, else .env.
export async function testAiConnection(values: AiTestValues): Promise<Result> {
  const me = await getCurrentUser()
  if (me?.role !== "admin") return { ok: false, error: NOT_ALLOWED }
  const parsed = aiTestSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: INVALID }
  const { provider, model, apiKey, compatBaseUrl } = parsed.data

  const saved = await getAiSettings()
  try {
    await testModel(modelId(provider, model), {
      apiKeys: { ...saved.apiKeys, ...(apiKey && { [provider]: apiKey }) },
      compatBaseUrl: compatBaseUrl || saved.compatBaseUrl,
    })
    return { ok: true }
  } catch (error) {
    console.error(`AI test failed (${provider}):`, (error as Error).message)
    return { ok: false, error: testError(error) }
  }
}
