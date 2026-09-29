"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser, hashSecret, newRecoveryCode } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase"
import {
  adminCreateSchema,
  adminPasswordSchema,
  adminPlanSchema,
  type AdminCreateValues,
  type AdminPasswordValues,
  type AdminPlanValues,
} from "@/lib/validation"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const INVALID = "సమాచారం సరిగా లేదు."
const FAILED = "సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి."

// Every action re-checks the caller: Server Actions are public endpoints.
async function asAdmin<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  const me = await getCurrentUser()
  if (me?.role !== "admin") return { ok: false, error: "అనుమతి లేదు." }
  try {
    const result = await fn()
    if (result.ok) revalidatePath("/admin")
    return result
  } catch (error) {
    console.error(error)
    return { ok: false, error: FAILED }
  }
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
        failed_logins: 0,
        locked_until: null,
      })
      .eq("id", userId)
    if (error) throw error
    return { ok: true, recoveryCode }
  })
}
