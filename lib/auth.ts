// Server-only account/session helpers (username or phone + password, no OTP).
// One session per user: a new login replaces session_token_hash, so the
// previous device is signed out on its next request.
import {
  createHash,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from "node:crypto"
import { promisify } from "node:util"
import { cookies } from "next/headers"
import type { Plan } from "@/lib/plans"
import { getSupabase } from "@/lib/supabase"
import { isPhone, normalizePhone } from "@/lib/validation"

const scryptAsync = promisify(scrypt) as (
  secret: string,
  salt: string,
  keylen: number
) => Promise<Buffer>

const SESSION_COOKIE = "rn_session"
const SESSION_MAX_AGE = 400 * 24 * 60 * 60 // browsers cap cookies at 400 days
const MAX_TRUSTED_DEVICES = 5

export type AppUser = {
  id: string
  username: string
  phone: string | null
  role: "user" | "admin"
  plan: Plan
  trial_ends_at: string
  plan_expires_at: string | null
}

// Includes secrets: never send to the client.
export type AppUserRecord = AppUser & {
  password_hash: string
  recovery_code_hash: string | null
  trusted_devices: string[]
  failed_logins: number
  locked_until: string | null
  reset_count: number
  reset_day: string | null
}

export const USER_COLUMNS =
  "id, username, phone, role, plan, trial_ends_at, plan_expires_at"

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex")

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex")
  const hash = await scryptAsync(secret, salt, 32)
  return `${salt}:${hash.toString("hex")}`
}

export async function verifySecret(
  secret: string,
  stored: string | null
): Promise<boolean> {
  const [salt, hash] = stored?.split(":") ?? []
  if (!salt || !hash) return false
  const actual = await scryptAsync(secret, salt, 32)
  return timingSafeEqual(actual, Buffer.from(hash, "hex"))
}

export const newRecoveryCode = () =>
  String(randomInt(0, 1_000_000)).padStart(6, "0")

export const deviceHash = (deviceId: string) => sha256(`device:${deviceId}`)

export async function findUser(
  identifier: string
): Promise<AppUserRecord | null> {
  const query = getSupabase().from("app_users").select("*")
  const { data, error } = isPhone(identifier)
    ? await query.eq("phone", normalizePhone(identifier)).maybeSingle()
    : await query.eq("username", identifier.trim().toLowerCase()).maybeSingle()
  if (error) throw error
  return data as AppUserRecord | null
}

async function setSessionCookie(token: string) {
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

// Signs the user in on this device (and out everywhere else).
export async function startSession(
  user: Pick<AppUserRecord, "id" | "trusted_devices">,
  deviceId?: string
) {
  const token = randomBytes(32).toString("base64url")
  const devices = deviceId
    ? [
        ...user.trusted_devices.filter((d) => d !== deviceHash(deviceId)),
        deviceHash(deviceId),
      ].slice(-MAX_TRUSTED_DEVICES)
    : user.trusted_devices

  const { error } = await getSupabase()
    .from("app_users")
    .update({
      session_token_hash: sha256(token),
      trusted_devices: devices,
      failed_logins: 0,
      locked_until: null,
    })
    .eq("id", user.id)
  if (error) throw error
  await setSessionCookie(token)
}

// Cookie -> user, or null when signed out / signed in on another device.
export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const { data, error } = await getSupabase()
    .from("app_users")
    .select(USER_COLUMNS)
    .eq("session_token_hash", sha256(token))
    .maybeSingle()
  if (error) throw error
  return data as AppUser | null
}

// Sliding expiry so farmers are never logged out (Route Handlers / Actions only).
export async function renewSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (token) await setSessionCookie(token)
}
