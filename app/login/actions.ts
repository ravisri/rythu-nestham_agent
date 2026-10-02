"use server"

import { redirect } from "next/navigation"
import {
  deviceHash,
  endSession,
  findUser,
  hashSecret,
  newRecoveryCode,
  startSession,
  verifySecret,
} from "@/lib/auth"
import { istDay } from "@/lib/plans"
import { getSupabase } from "@/lib/supabase"
import {
  deviceIdSchema,
  forgotSchema,
  loginSchema,
  resetSchema,
  signupSchema,
  type ForgotValues,
  type LoginValues,
  type ResetValues,
  type SignupValues,
} from "@/lib/validation"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15
const MAX_RESETS_PER_DAY = 3

const INVALID = "సమాచారం సరిగా లేదు. మళ్లీ ప్రయత్నించండి."
const WRONG_LOGIN = "యూజర్‌నేమ్/ఫోన్ లేదా పాస్‌వర్డ్ తప్పు."
const FAILED = "సమస్య వచ్చింది. కొద్దిసేపటి తర్వాత ప్రయత్నించండి."

async function guard<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn()
  } catch (error) {
    console.error(error)
    return { ok: false, error: FAILED }
  }
}

export async function signup(
  values: SignupValues,
  deviceId?: string
): Promise<Result<{ recoveryCode: string }>> {
  const parsed = signupSchema.safeParse(values)
  const device = deviceIdSchema.safeParse(deviceId)
  if (!parsed.success || !device.success) return { ok: false, error: INVALID }
  const { username, phone, password } = parsed.data

  return guard<{ recoveryCode: string }>(async () => {
    const recoveryCode = newRecoveryCode()
    const { data, error } = await getSupabase()
      .from("app_users")
      .insert({
        username,
        phone: phone || null,
        password_hash: await hashSecret(password),
        recovery_code_hash: await hashSecret(recoveryCode),
      })
      .select("id, trusted_devices")
      .single()

    if (error?.code === "23505") {
      return {
        ok: false,
        error: error.message.includes("phone")
          ? "ఈ ఫోన్ నంబర్‌తో ఇప్పటికే ఖాతా ఉంది."
          : "ఈ యూజర్‌నేమ్ ఇప్పటికే ఉంది. వేరేది ఎంచుకోండి.",
      }
    }
    if (error) throw error

    await startSession(data, device.data)
    return { ok: true, recoveryCode }
  })
}

export async function login(
  values: LoginValues,
  deviceId?: string
): Promise<Result> {
  const parsed = loginSchema.safeParse(values)
  const device = deviceIdSchema.safeParse(deviceId)
  if (!parsed.success || !device.success) return { ok: false, error: INVALID }

  return guard<object>(async () => {
    const user = await findUser(parsed.data.identifier)
    if (!user) return { ok: false, error: WRONG_LOGIN }

    if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
      return {
        ok: false,
        error: `చాలా సార్లు తప్పు పాస్‌వర్డ్. ${LOCK_MINUTES} నిమిషాల తర్వాత ప్రయత్నించండి.`,
      }
    }

    if (!(await verifySecret(parsed.data.password, user.password_hash))) {
      const failed = user.failed_logins + 1
      const locked = failed >= MAX_FAILED_LOGINS
      await getSupabase()
        .from("app_users")
        .update({
          failed_logins: locked ? 0 : failed,
          locked_until: locked
            ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
            : null,
        })
        .eq("id", user.id)
      return { ok: false, error: WRONG_LOGIN }
    }

    await startSession(user, device.data)
    return { ok: true }
  })
}

// Step 1 of "forgot password": does the account exist, and is this a device
// that has signed in to it before (then no recovery code is needed)?
export async function checkReset(
  values: ForgotValues,
  deviceId?: string
): Promise<Result<{ trusted: boolean }>> {
  const parsed = forgotSchema.safeParse(values)
  const device = deviceIdSchema.safeParse(deviceId)
  if (!parsed.success || !device.success) return { ok: false, error: INVALID }

  return guard<{ trusted: boolean }>(async () => {
    const user = await findUser(parsed.data.identifier)
    if (!user) {
      return { ok: false, error: "ఈ యూజర్‌నేమ్/ఫోన్‌తో ఖాతా లేదు." }
    }
    const trusted =
      !!device.data && user.trusted_devices.includes(deviceHash(device.data))
    return { ok: true, trusted }
  })
}

export async function resetPassword(
  values: ResetValues,
  deviceId?: string
): Promise<Result> {
  const parsed = resetSchema.safeParse(values)
  const device = deviceIdSchema.safeParse(deviceId)
  if (!parsed.success || !device.success) return { ok: false, error: INVALID }
  const { identifier, recoveryCode, password } = parsed.data

  return guard<object>(async () => {
    const user = await findUser(identifier)
    if (!user) return { ok: false, error: "ఈ యూజర్‌నేమ్/ఫోన్‌తో ఖాతా లేదు." }

    const today = istDay()
    const attempts = user.reset_day === today ? user.reset_count : 0
    if (attempts >= MAX_RESETS_PER_DAY) {
      return {
        ok: false,
        error: "ఈరోజు ప్రయత్నాలు అయిపోయాయి. రేపు ప్రయత్నించండి లేదా అడ్మిన్‌ను సంప్రదించండి.",
      }
    }

    const trusted =
      !!device.data && user.trusted_devices.includes(deviceHash(device.data))
    const allowed =
      trusted ||
      (recoveryCode !== "" &&
        (await verifySecret(recoveryCode, user.recovery_code_hash)))

    const { error } = await getSupabase()
      .from("app_users")
      .update({
        reset_day: today,
        reset_count: attempts + 1,
        ...(allowed && {
          password_hash: await hashSecret(password),
          failed_logins: 0,
          locked_until: null,
        }),
      })
      .eq("id", user.id)
    if (error) throw error

    if (!allowed) {
      return {
        ok: false,
        error: "రికవరీ కోడ్ తప్పు. సరైన కోడ్ ఇవ్వండి లేదా అడ్మిన్‌ను సంప్రదించండి.",
      }
    }

    await startSession(user, device.data)
    return { ok: true }
  })
}

export async function logout() {
  await endSession()
  redirect("/login")
}
