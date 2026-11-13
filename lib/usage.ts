// Server-only credit metering on usage_daily (see 0003_accounts.sql).
import type { AppUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { istDay, periodStart, PLANS, planStatus, type Usage } from "@/lib/plans"

export type ChargeResult = "ok" | "daily" | "period"

export async function chargeCredits(
  user: AppUser,
  cost: number
): Promise<ChargeResult> {
  const plan = PLANS[user.plan]
  const day = istDay()
  const [{ result }] = await db()`
    select use_credits(${user.id}::uuid, ${day}::date, ${cost}::int,
      ${plan.daily}::int, ${plan.period}::int,
      ${periodStart(user.plan, day)}::date) as result`
  return result === 0 ? "ok" : result === 1 ? "daily" : "period"
}

// Counts one photo against today's plan limit. Fails open so photo questions
// never break on a DB hiccup.
export async function chargePhoto(user: AppUser): Promise<boolean> {
  try {
    const [{ ok }] = await db()`
      select use_photo(${user.id}::uuid, ${istDay()}::date,
        ${PLANS[user.plan].photosDaily}::int) as ok`
    return ok !== false
  } catch (error) {
    console.error("chargePhoto failed:", error)
    return true
  }
}

export async function refundPhoto(userId: string) {
  await db()`select refund_photo(${userId}::uuid, ${istDay()}::date)`.catch(
    (error) => console.error("refundPhoto failed:", error)
  )
}

// "Next question" suggestions left today (0 on a DB error).
export async function userSuggestionsLeft(user: AppUser): Promise<number> {
  try {
    const rows = await db()`
      select suggestions from usage_daily
      where user_id = ${user.id}::uuid and day = ${istDay()}::date`
    const used = (rows[0]?.suggestions as number | undefined) ?? 0
    return Math.max(0, PLANS[user.plan].suggestionsDaily - used)
  } catch {
    return 0
  }
}

export async function addUserSuggestion(userId: string) {
  await db()`select add_user_suggestion(${userId}::uuid, ${istDay()}::date)`.catch(
    (error) => console.error("addUserSuggestion failed:", error)
  )
}

// Tokens after a reply; negative credits = refund after an error.
export async function recordUsage(
  userId: string,
  credits: number,
  tokensIn = 0,
  tokensOut = 0
) {
  await db()`
    select add_usage(${userId}::uuid, ${istDay()}::date, ${credits}::int,
      ${tokensIn}::int, ${tokensOut}::int)`.catch((error) =>
    console.error("recordUsage failed:", error)
  )
}

// Credits used today and in the current period, per user.
export async function usedCredits(
  users: Pick<AppUser, "id" | "plan">[]
): Promise<Map<string, { today: number; period: number }>> {
  const day = istDay()
  const result = new Map(users.map((u) => [u.id, { today: 0, period: 0 }]))
  if (users.length === 0) return result

  // All rows since the longest period start; filtered per plan below.
  const rows = await db()`
    select user_id, day, credits from usage_daily
    where user_id = any(${users.map((u) => u.id)}::uuid[])
      and day >= ${periodStart("trial")}::date`

  const plans = new Map(users.map((u) => [u.id, u.plan]))
  for (const row of rows as {
    user_id: string
    day: string
    credits: number
  }[]) {
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
      ? Math.max(
          0,
          Math.min(plan.daily - used.today, plan.period - used.period)
        )
      : 0
  return { plan: user.plan, left, status }
}
