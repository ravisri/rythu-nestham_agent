// Plans and credit rules. Client-safe (no server imports).
// 1 text question = 1 credit (~3k tokens), 1 photo question = 2 credits.

export const PLANS = {
  trial: { label: "ఉచిత ట్రయల్", daily: 5, period: 50, perMonth: false },
  pro: { label: "ప్రో", daily: 20, period: 400, perMonth: true },
  pro_plus: { label: "ప్రో ప్లస్", daily: 80, period: 1500, perMonth: true },
} as const

export type Plan = keyof typeof PLANS

export type PlanUser = {
  plan: Plan
  trial_ends_at: string
  plan_expires_at: string | null
}

export type PlanStatus = "active" | "trial_over" | "expired"

export type Usage = { planLabel: string; left: number; status: PlanStatus }

export const creditCost = (hasImage: boolean) => (hasImage ? 2 : 1)

// Calendar day in India (IST, UTC+5:30) as yyyy-mm-dd.
export function istDay(date = new Date()): string {
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10)
}

// Trial credits count over the whole trial; paid plans reset each month.
export function periodStart(plan: Plan, day = istDay()): string {
  return PLANS[plan].perMonth ? `${day.slice(0, 8)}01` : "2000-01-01"
}

export function planStatus(user: PlanUser, now = Date.now()): PlanStatus {
  if (user.plan === "trial") {
    return now > Date.parse(user.trial_ends_at) ? "trial_over" : "active"
  }
  return user.plan_expires_at && now > Date.parse(user.plan_expires_at)
    ? "expired"
    : "active"
}

// Server error texts (Telugu, read aloud). The client matches SESSION_ENDED.
export const MESSAGES = {
  sessionEnded: "మీ ఖాతా వేరే ఫోన్‌లో లాగిన్ అయింది. మళ్లీ లాగిన్ అవ్వండి.",
  trialOver:
    "ఉచిత ట్రయల్ ముగిసింది. ప్రో ప్లాన్ కోసం అడ్మిన్‌ను సంప్రదించండి.",
  expired: "మీ ప్లాన్ గడువు ముగిసింది. అడ్మిన్‌ను సంప్రదించండి.",
  dailyLimit: "ఈరోజు ప్రశ్నల పరిమితి అయిపోయింది. రేపు మళ్లీ అడగండి.",
  periodLimit: "ఈ నెల ప్రశ్నల పరిమితి అయిపోయింది. అడ్మిన్‌ను సంప్రదించండి.",
  trialLimit:
    "ఉచిత ట్రయల్ ప్రశ్నలు అయిపోయాయి. ప్రో ప్లాన్ కోసం అడ్మిన్‌ను సంప్రదించండి.",
} as const
