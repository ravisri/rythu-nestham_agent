// Server-only credit metering on usage_daily (see 0003_accounts.sql).
import type { AppUser } from "@/lib/auth"
import { istDay, periodStart, PLANS, planStatus, type Usage } from "@/lib/plans"
import { getSupabase } from "@/lib/supabase"

export type ChargeResult = "ok" | "daily" | "period"

export async function chargeCredits(
  user: AppUser,
  cost: number
): Promise<ChargeResult> {
  const plan = PLANS[user.plan]
  const day = istDay()
  const { data, error } = await getSupabase().rpc("use_credits", {
    p_user: user.id,
    p_day: day,
    p_cost: cost,
    p_daily_limit: plan.daily,
    p_period_limit: plan.period,
    p_period_start: periodStart(user.plan, day),
  })
  if (error) throw error
  return data === 0 ? "ok" : data === 1 ? "daily" : "period"
}

// Counts one photo against today's plan limit. Fails open (e.g. before
// migration 0005 is run) so photo questions never break.
export async function chargePhoto(user: AppUser): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("use_photo", {
    p_user: user.id,
    p_day: istDay(),
    p_limit: PLANS[user.plan].photosDaily,
  })
  if (error) {
    console.error("chargePhoto failed:", error)
    return true
  }
  return data !== false
}

export async function refundPhoto(userId: string) {
  const { error } = await getSupabase().rpc("refund_photo", {
    p_user: userId,
    p_day: istDay(),
  })
  if (error) console.error("refundPhoto failed:", error)
}

// Tokens after a reply; negative credits = refund after an error.
export async function recordUsage(
  userId: string,
  credits: number,
  tokensIn = 0,
  tokensOut = 0
) {
  const { error } = await getSupabase().rpc("add_usage", {
    p_user: userId,
    p_day: istDay(),
    p_credits: credits,
    p_tokens_in: tokensIn,
    p_tokens_out: tokensOut,
  })
  if (error) console.error("recordUsage failed:", error)
}

// Credits used today and in the current period, per user.
export async function usedCredits(
  users: Pick<AppUser, "id" | "plan">[]
): Promise<Map<string, { today: number; period: number }>> {
  const day = istDay()
  const result = new Map(users.map((u) => [u.id, { today: 0, period: 0 }]))
  if (users.length === 0) return result

  const { data, error } = await getSupabase()
    .from("usage_daily")
    .select("user_id, day, credits")
    .in("user_id", users.map((u) => u.id))
    .gte("day", periodStart("trial")) // all rows; filtered per plan below
  if (error) throw error

  const plans = new Map(users.map((u) => [u.id, u.plan]))
  for (const row of data as { user_id: string; day: string; credits: number }[]) {
    const entry = result.get(row.user_id)!
    if (row.day === day) entry.today += row.credits
    if (row.day >= periodStart(plans.get(row.user_id)!, day))
      entry.period += row.credits
  }
  return result
}

export async function usageSummary(user: AppUser): Promise<Usage> {
  const plan = PLANS[user.plan]
  const status = planStatus(user)
  const used = (await usedCredits([user])).get(user.id)!
  const left =
    status === "active"
      ? Math.max(0, Math.min(plan.daily - used.today, plan.period - used.period))
      : 0
  return { plan: user.plan, left, status }
}
