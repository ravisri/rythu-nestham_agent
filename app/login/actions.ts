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
import { db, pgCode } from "@/lib/db"
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
    let created
    try {
      ;[created] = await db()`
        insert into app_users (username, phone, password_hash, recovery_code_hash)
        values (${username}, ${phone || null}, ${await hashSecret(password)},
          ${await hashSecret(recoveryCode)})
        returning id, trusted_devices`
    } catch (error) {
      if (pgCode(error) !== "23505") throw error
      return {
        ok: false,
        error: String((error as Error).message).includes("phone")
          ? "ఈ ఫోన్ నంబర్‌తో ఇప్పటికే ఖాతా ఉంది."
          : "ఈ యూజర్‌నేమ్ ఇప్పటికే ఉంది. వేరేది ఎంచుకోండి.",
      }
    }

    await startSession(
      created as { id: string; trusted_devices: string[] },
      device.data
    )
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
      const lockedUntil = locked
        ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
        : null
      await db()`
        update app_users set failed_logins = ${locked ? 0 : failed},
          locked_until = ${lockedUntil}::timestamptz
        where id = ${user.id}::uuid`
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

    if (allowed) {
      await db()`
        update app_users set reset_day = ${today}::date,
          reset_count = ${attempts + 1},
          password_hash = ${await hashSecret(password)},
          failed_logins = 0, locked_until = null
        where id = ${user.id}::uuid`
    } else {
      await db()`
        update app_users set reset_day = ${today}::date,
          reset_count = ${attempts + 1}
        where id = ${user.id}::uuid`
    }

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
