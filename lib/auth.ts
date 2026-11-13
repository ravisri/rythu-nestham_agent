// Server-only account/session helpers (username or phone + password, no OTP).
// One session per user: a new login replaces session_token_hash, so the
// previous device is signed out on its next request. Admins get 2 devices:
// the second-newest session is kept in prev_session_token_hash (migration 0011);
// a 3rd admin login drops the oldest.
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
import { db } from "@/lib/db"
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
  const rows = isPhone(identifier)
    ? await db()`select * from app_users where phone = ${normalizePhone(identifier)}`
    : await db()`select * from app_users
        where username = ${identifier.trim().toLowerCase()}`
  return (rows[0] as AppUserRecord | undefined) ?? null
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

// Signs the user in on this device and out everywhere else; admins keep their
// most recent other device too (max 2).
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

  // The session already on this phone (re-login) must not count as "other device".
  const old = (await cookies()).get(SESSION_COOKIE)?.value
  const thisDevice = old ? sha256(old) : undefined
  const [row] = await db()`
    select role, session_token_hash, prev_session_token_hash
    from app_users where id = ${user.id}::uuid`
  const keep: string | null =
    row?.role === "admin"
      ? ([row.session_token_hash, row.prev_session_token_hash].find(
          (h) => h && h !== thisDevice
        ) ?? null)
      : null

  await db()`
    update app_users set
      session_token_hash = ${sha256(token)},
      prev_session_token_hash = ${keep},
      trusted_devices = ${devices}::text[],
      failed_logins = 0,
      locked_until = null
    where id = ${user.id}::uuid`
  await setSessionCookie(token)
}

// Cookie -> user, or null when signed out / signed in on another device.
export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const hash = sha256(token)
  // Newest session of anyone, or an admin's second device.
  const rows = await db()`
    select id, username, phone, role, plan, trial_ends_at, plan_expires_at
    from app_users
    where session_token_hash = ${hash}
       or (prev_session_token_hash = ${hash} and role = 'admin')
    limit 1`
  return (rows[0] as AppUser | undefined) ?? null
}

// Sliding expiry so farmers are never logged out (Route Handlers / Actions only).
export async function renewSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (token) await setSessionCookie(token)
}

// Logout: forget this session in the DB and remove the cookie.
export async function endSession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    // Only this session's slot is cleared; an admin's other device stays in.
    const hash = sha256(token)
    await db()`
      update app_users set
        session_token_hash = case when session_token_hash = ${hash}
          then null else session_token_hash end,
        prev_session_token_hash = case when prev_session_token_hash = ${hash}
          then null else prev_session_token_hash end
      where session_token_hash = ${hash} or prev_session_token_hash = ${hash}`
  }
  store.delete(SESSION_COOKIE)
}

// Session cookie present (valid or not): an ended session is not a guest.
export async function hasSessionCookie() {
  return (await cookies()).has(SESSION_COOKIE)
}

const GUEST_COOKIE = "rn_guest"

// Guest (not logged in) id from its cookie; `create` sets one (Route Handlers only).
export async function getGuestId(create = false): Promise<string | undefined> {
  const store = await cookies()
  const id = store.get(GUEST_COOKIE)?.value
  if (id || !create) return id
  const fresh = randomBytes(16).toString("base64url")
  store.set(GUEST_COOKIE, fresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
  return fresh
}

// Hashed client IP: caps guests who clear their cookies.
export function ipKey(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  return sha256(ip)
}
