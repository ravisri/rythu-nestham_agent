// Server-only AI token tracking (model_usage, guest_usage tokens) for /admin/usage.
// Recording never throws: a tracking failure must not break a farmer's answer.
import { APICallError } from "ai"
import { db } from "@/lib/db"
import { istDay } from "@/lib/plans"

export type Audience = "user" | "guest"

// Out of free quota / credits / rate limit: the admin should switch models.
export function isQuotaError(error: unknown): boolean {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined
  return (
    status === 429 ||
    /quota|RESOURCE_EXHAUSTED|rate.?limit|insufficient_quota|credit balance|billing/i.test(
      String(error)
    )
  )
}

export async function recordModelUsage(entry: {
  model: string
  audience: Audience
  tokensIn?: number
  tokensOut?: number
  error?: unknown
}) {
  const failed = entry.error !== undefined
  const quota = failed && isQuotaError(entry.error)
  await db()`
    select add_model_usage(${istDay()}::date, ${entry.model}, ${entry.audience},
      ${entry.tokensIn ?? 0}::bigint, ${entry.tokensOut ?? 0}::bigint,
      ${failed}::boolean, ${quota}::boolean)`.catch((error) =>
    console.error("recordModelUsage failed:", error)
  )
}

export async function recordGuestTokens(
  guestId: string,
  tokensIn: number,
  tokensOut: number
) {
  await db()`
    select add_guest_tokens(${`g:${guestId}`}, ${istDay()}::date,
      ${tokensIn}::bigint, ${tokensOut}::bigint)`.catch((error) =>
    console.error("recordGuestTokens failed:", error)
  )
}

// All guest tokens today (for the admin's optional daily guest budget).
export async function guestTokensToday(): Promise<number> {
  try {
    const [{ total }] = await db()`
      select coalesce(sum(tokens_in + tokens_out), 0)::text as total
      from model_usage
      where day = ${istDay()}::date and audience = 'guest'`
    return Number(total)
  } catch {
    return 0
  }
}

export type ModelUsageRow = {
  day: string
  model: string
  audience: Audience
  requests: number
  tokens_in: number
  tokens_out: number
  errors: number
  quota_errors: number
  last_error_at: string | null
}

// Last `days` days of model_usage (empty on a DB error).
export async function modelUsage(days: number): Promise<ModelUsageRow[]> {
  const from = istDay(new Date(Date.now() - (days - 1) * 86_400_000))
  try {
    const rows = await db()`
      select * from model_usage where day >= ${from}::date order by day desc`
    return rows.map((r) => ({
      ...r,
      tokens_in: Number(r.tokens_in),
      tokens_out: Number(r.tokens_out),
    })) as ModelUsageRow[]
  } catch {
    return []
  }
}

// Models with quota / rate-limit errors today (admin alert banner).
export async function quotaAlerts(): Promise<ModelUsageRow[]> {
  return (await modelUsage(1)).filter((r) => r.quota_errors > 0)
}

export type TopUser = {
  id: string
  username: string
  todayTokens: number
  periodTokens: number
  periodCredits: number
}

// Logged-in users by tokens over the last `days` days (usage_daily).
export async function topUsers(days: number, limit = 20): Promise<TopUser[]> {
  const today = istDay()
  const from = istDay(new Date(Date.now() - (days - 1) * 86_400_000))
  const data = await db()`
    select user_id, day, credits, tokens_in, tokens_out
    from usage_daily where day >= ${from}::date`.catch(() => null)
  if (!data?.length) return []

  const totals = new Map<string, Omit<TopUser, "id" | "username">>()
  for (const r of data) {
    const t = totals.get(r.user_id) ?? {
      todayTokens: 0,
      periodTokens: 0,
      periodCredits: 0,
    }
    const tokens = Number(r.tokens_in) + Number(r.tokens_out)
    t.periodTokens += tokens
    t.periodCredits += r.credits
    if (r.day === today) t.todayTokens += tokens
    totals.set(r.user_id, t)
  }
  const ids = [...totals.keys()]
    .sort((a, b) => totals.get(b)!.periodTokens - totals.get(a)!.periodTokens)
    .slice(0, limit)
  const users = await db()`
    select id, username from app_users where id = any(${ids}::uuid[])`.catch(
    () => []
  )
  const names = new Map(users.map((u) => [u.id, u.username as string]))
  return ids.map((id) => ({
    id,
    username: names.get(id) ?? "?",
    ...totals.get(id)!,
  }))
}

export type GuestRow = { id: string; questions: number; tokens: number }

// Guests today: how many, and who used the most tokens (ids shortened).
export async function guestsToday(limit = 10) {
  const data = await db()`
    select key, questions, tokens_in, tokens_out from guest_usage
    where day = ${istDay()}::date and key like 'g:%'`.catch(() => null)
  if (!data) return { count: 0, questions: 0, top: [] as GuestRow[] }
  const rows: GuestRow[] = data.map((r) => ({
    id: (r.key as string).slice(2, 8),
    questions: r.questions,
    tokens: Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0),
  }))
  return {
    count: rows.length,
    questions: rows.reduce((s, r) => s + r.questions, 0),
    top: rows.sort((a, b) => b.tokens - a.tokens).slice(0, limit),
  }
}
