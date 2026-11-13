// Server-only: daily active guests / signed-in users for the admin (counts only).
// Guest detail rows are kept for the current + previous IST month, then purged.
import { db } from "@/lib/db"
import { istDay } from "@/lib/plans"

export type ActivityDay = {
  day: string
  guests: number
  guest_requests: number
  users: number
  user_requests: number
}

// 1st day of the previous IST month (yyyy-mm-dd).
export function activityFrom(today = istDay()): string {
  const [y, m] = today.split("-").map(Number)
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
  return `${prev.y}-${String(prev.m).padStart(2, "0")}-01`
}

// Newest day first. Empty on a DB error.
export async function getActivity(): Promise<ActivityDay[]> {
  try {
    const rows = await db()`
      select * from activity_by_day(${activityFrom()}::date)`
    return rows.map((r) => ({
      day: r.day,
      guests: Number(r.guests),
      guest_requests: Number(r.guest_requests),
      users: Number(r.users),
      user_requests: Number(r.user_requests),
    }))
  } catch (error) {
    console.error("getActivity failed:", (error as Error).message)
    return []
  }
}

// At most once per IST day per server: drop guest rows older than last month.
let cleanedOn: string | undefined

export function cleanupGuestUsage() {
  const today = istDay()
  if (cleanedOn === today) return
  cleanedOn = today
  void db()`select purge_guest_usage(${activityFrom(today)}::date)`.catch(
    (error) => console.error("purge_guest_usage failed:", error.message)
  )
}
