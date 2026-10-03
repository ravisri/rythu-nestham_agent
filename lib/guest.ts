// Server-only metering for guests (no login): GUEST limits per IST day.
import { GUEST, istDay } from "@/lib/plans"
import { getSupabase } from "@/lib/supabase"

export type GuestCharge = "ok" | "limit" | "photo"

const keys = (guestId: string, ip: string) => ({
  p_guest: `g:${guestId}`,
  p_ip: `ip:${ip}`,
})

// Fails closed: on a DB error the guest is asked to sign up (no free AI calls).
export async function chargeGuest(
  guestId: string,
  ip: string,
  photo: boolean
): Promise<GuestCharge> {
  const { data, error } = await getSupabase().rpc("use_guest", {
    ...keys(guestId, ip),
    p_day: istDay(),
    p_limit: GUEST.daily,
    p_ip_limit: GUEST.ipDaily,
    p_photo: photo,
    p_photo_limit: GUEST.photos,
  })
  if (error) {
    console.error("chargeGuest failed:", error)
    return "limit"
  }
  return data === 0 ? "ok" : data === 2 ? "photo" : "limit"
}

export async function refundGuest(guestId: string, ip: string, photo: boolean) {
  const { error } = await getSupabase().rpc("refund_guest", {
    ...keys(guestId, ip),
    p_day: istDay(),
    p_photo: photo,
  })
  if (error) console.error("refundGuest failed:", error)
}

// "Next question" suggestions left today (0 if migration 0008 isn't run).
export async function guestSuggestionsLeft(guestId: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from("guest_usage")
    .select("suggestions")
    .eq("key", `g:${guestId}`)
    .eq("day", istDay())
    .maybeSingle()
  if (error) return 0
  const used = (data?.suggestions as number | undefined) ?? 0
  return Math.max(0, GUEST.suggestions - used)
}

export async function addGuestSuggestion(guestId: string) {
  const { error } = await getSupabase().rpc("add_guest_suggestion", {
    p_guest: `g:${guestId}`,
    p_day: istDay(),
  })
  if (error) console.error("addGuestSuggestion failed:", error)
}

// Questions left today for this guest cookie (full allowance if new).
export async function guestLeft(guestId?: string): Promise<number> {
  if (!guestId) return GUEST.daily
  const { data, error } = await getSupabase()
    .from("guest_usage")
    .select("questions")
    .eq("key", `g:${guestId}`)
    .eq("day", istDay())
    .maybeSingle()
  if (error) return GUEST.daily
  return Math.max(0, GUEST.daily - ((data?.questions as number) ?? 0))
}
