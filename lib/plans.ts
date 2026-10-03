// Plans and credit rules. Client-safe (no server imports).
// 1 text question = 1 credit (~3k tokens), 1 photo question = 2 credits.
// photosDaily: photo questions per IST day (photos cost the most tokens).
// suggestionsDaily: times per day the AI adds 2 "next question" suggestions.

export const PLANS = {
  // Labels: lib/i18n/dictionaries.ts (plans.*)
  trial: {
    daily: 5,
    period: 50,
    perMonth: false,
    photosDaily: 2,
    suggestionsDaily: 5,
  },
  pro: {
    daily: 20,
    period: 400,
    perMonth: true,
    photosDaily: 10,
    suggestionsDaily: 20,
  },
  pro_plus: {
    daily: 80,
    period: 1500,
    perMonth: true,
    photosDaily: 30,
    suggestionsDaily: 40,
  },
} as const

export type Plan = keyof typeof PLANS

// Not logged in: questions per IST day (photos count as questions), plus a
// per-IP cap so clearing cookies doesn't give unlimited questions.
export const GUEST = {
  daily: 5,
  photos: 1,
  ipDaily: 15,
  suggestions: 1,
} as const

export type PlanUser = {
  plan: Plan
  trial_ends_at: string
  plan_expires_at: string | null
}

export type PlanStatus = "active" | "trial_over" | "expired"

export type Usage = { plan: Plan; left: number; status: PlanStatus }

// shadcn Badge variant per status. Labels: lib/i18n/dictionaries.ts (status.*)
export const PLAN_STATUS = {
  active: "secondary",
  trial_over: "destructive",
  expired: "destructive",
} as const

// ISO timestamp -> "1 అక్టోబర్, 2026" / "1 October 2026" (IST)
export const formatIstDate = (iso: string, locale: "te" | "en" = "te") =>
  new Date(iso).toLocaleDateString(`${locale}-IN`, {
    timeZone: "Asia/Kolkata",
    dateStyle: "long",
  })

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
  trialOver: "ఉచిత ట్రయల్ ముగిసింది. ప్రో ప్లాన్ కోసం అడ్మిన్‌ను సంప్రదించండి.",
  expired: "మీ ప్లాన్ గడువు ముగిసింది. అడ్మిన్‌ను సంప్రదించండి.",
  dailyLimit: "ఈరోజు ప్రశ్నల పరిమితి అయిపోయింది. రేపు మళ్లీ అడగండి.",
  periodLimit: "ఈ నెల ప్రశ్నల పరిమితి అయిపోయింది. అడ్మిన్‌ను సంప్రదించండి.",
  notAgri: "దయచేసి వ్యవసాయం, పంటలకు సంబంధించిన ప్రశ్నను స్పష్టంగా అడగండి.",
  notAvailable:
    "ప్రస్తుతం ఈ సమాచారం యాప్‌లో అందుబాటులో లేదు. అడ్మిన్ త్వరలోనే దీన్ని చేరుస్తారు. అప్పటివరకు స్థానిక రైతు భరోసా కేంద్రాన్ని సంప్రదించండి.",
  photoLimit:
    "ఈరోజు ఫోటో పరిమితి అయిపోయింది. రేపు మళ్లీ ఫోటో పంపండి. ఇప్పుడు ప్రశ్నను టైప్ చేయండి లేదా మాట్లాడండి.",
  notAgriImage:
    "దయచేసి వ్యవసాయానికి సంబంధించిన ఫోటోలు మాత్రమే పంపండి (పంట, ఆకు, కాయ, పురుగు, నేల).",
  guestLimit:
    "ఈరోజు ఉచిత ప్రశ్నలు అయిపోయాయి. ఉచితంగా ఖాతా తెరిచి మరిన్ని ప్రశ్నలు అడగండి.",
  guestPhotoLimit:
    "అతిథిగా రోజుకు ఒక ఫోటో మాత్రమే. ఉచిత ఖాతా తెరిస్తే ఎక్కువ ఫోటోలు పంపవచ్చు.",
  trialLimit:
    "ఉచిత ట్రయల్ ప్రశ్నలు అయిపోయాయి. ప్రో ప్లాన్ కోసం అడ్మిన్‌ను సంప్రదించండి.",
} as const
