// Server-only: daily active guests / signed-in users for the admin (counts only).
// Guest detail rows are kept for the current + previous IST month, then purged.
import { istDay } from "@/lib/plans"
import { getSupabase } from "@/lib/supabase"

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

// Newest day first. Empty if migration 0010 isn't run yet.
export async function getActivity(): Promise<ActivityDay[]> {
  const { data, error } = await getSupabase().rpc("activity_by_day", {
    p_from: activityFrom(),
  })
  if (error) {
    console.error("getActivity failed:", error.message)
    return []
  }
  return data as ActivityDay[]
}

// At most once per IST day per server: drop guest rows older than last month.
let cleanedOn: string | undefined

export function cleanupGuestUsage() {
  const today = istDay()
  if (cleanedOn === today) return
  cleanedOn = today
  void getSupabase()
    .rpc("purge_guest_usage", { p_before: activityFrom(today) })
    .then(({ error }) => {
      if (error) console.error("purge_guest_usage failed:", error.message)
    })
}
