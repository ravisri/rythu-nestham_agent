// Server-only metering for guests (no login): GUEST limits per IST day.
import { cleanupGuestUsage } from "@/lib/activity"
import { db } from "@/lib/db"
import { GUEST, istDay } from "@/lib/plans"

export type GuestCharge = "ok" | "limit" | "photo"

const guestKey = (guestId: string) => `g:${guestId}`
const ipKeyOf = (ip: string) => `ip:${ip}`

// Fails closed: on a DB error the guest is asked to sign up (no free AI calls).
export async function chargeGuest(
  guestId: string,
  ip: string,
  photo: boolean
): Promise<GuestCharge> {
  cleanupGuestUsage() // monthly purge of old guest rows (once a day, background)
  try {
    const [{ result }] = await db()`
      select use_guest(${guestKey(guestId)}, ${ipKeyOf(ip)}, ${istDay()}::date,
        ${GUEST.daily}::int, ${GUEST.ipDaily}::int, ${photo}::boolean,
        ${GUEST.photos}::int) as result`
    return result === 0 ? "ok" : result === 2 ? "photo" : "limit"
  } catch (error) {
    console.error("chargeGuest failed:", error)
    return "limit"
  }
}

export async function refundGuest(guestId: string, ip: string, photo: boolean) {
  await db()`
    select refund_guest(${guestKey(guestId)}, ${ipKeyOf(ip)}, ${istDay()}::date,
      ${photo}::boolean)`.catch((error) =>
    console.error("refundGuest failed:", error)
  )
}

// Today's guest_usage row for this cookie (undefined = none / DB error).
async function todayRow(guestId: string) {
  const rows = await db()`
    select questions, suggestions from guest_usage
    where key = ${guestKey(guestId)} and day = ${istDay()}::date`.catch(
    () => null
  )
  return rows ? { row: rows[0] } : undefined
}

// "Next question" suggestions left today (0 on a DB error).
export async function guestSuggestionsLeft(guestId: string): Promise<number> {
  const found = await todayRow(guestId)
  if (!found) return 0
  const used = (found.row?.suggestions as number | undefined) ?? 0
  return Math.max(0, GUEST.suggestions - used)
}

export async function addGuestSuggestion(guestId: string) {
  await db()`
    select add_guest_suggestion(${guestKey(guestId)}, ${istDay()}::date)`.catch(
    (error) => console.error("addGuestSuggestion failed:", error)
  )
}

// Questions left today for this guest cookie (full allowance if new).
export async function guestLeft(guestId?: string): Promise<number> {
  if (!guestId) return GUEST.daily
  const found = await todayRow(guestId)
  if (!found) return GUEST.daily
  return Math.max(0, GUEST.daily - ((found.row?.questions as number) ?? 0))
}
