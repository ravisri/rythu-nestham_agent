import { BotIcon, ShieldIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { LanguageToggle } from "@/components/language-toggle"
import { PageHeader, PageShell } from "@/components/page-header"
import { ApiKeyCard } from "@/components/profile/api-key-card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { getCurrentUser } from "@/lib/auth"
import { getDictionary } from "@/lib/i18n/server"
import { formatIstDate, PLAN_STATUS, PLANS, planStatus } from "@/lib/plans"
import { getSupabase } from "@/lib/supabase"
import { usageSummary, usedCredits } from "@/lib/usage"
import { byokModelId } from "@/lib/ai"
import { getAiSettings } from "@/lib/ai-settings"
import { hasPeriodLimit } from "@/lib/plans"
import { mask } from "@/lib/secrets"
import { getUserGoogleKey } from "@/lib/user-keys"

// Used / limit with a bar (same numbers as before).
function Meter({
  label,
  used,
  limit,
}: {
  label: string
  used: number
  limit: number
}) {
  return (
    <div className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {used}/{limit}
        </span>
      </div>
      <Progress value={Math.min(100, (used / limit) * 100)} />
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const { locale, t } = await getDictionary()

  // Only the non-secret created_at; USER_COLUMNS already covers the rest.
  const [used, summary, created, ownKey, aiSettings] = await Promise.all([
    usedCredits([user]).then((m) => m.get(user.id)!),
    usageSummary(user),
    getSupabase()
      .from("app_users")
      .select("created_at")
      .eq("id", user.id)
      .single()
      .then(({ data }) => (data?.created_at as string | undefined) ?? null),
    getUserGoogleKey(user.id),
    getAiSettings(),
  ])

  const plan = PLANS[user.plan]
  const status = planStatus(user)
  const isAdmin = user.role === "admin"
  const isTrial = user.plan === "trial"
  const expiry = isTrial ? user.trial_ends_at : user.plan_expires_at
  const p = t.profile

  return (
    <PageShell>
      <PageHeader
        backHref="/"
        backLabel={t.common.back}
        icon={UserIcon}
        title={t.common.myProfile}
        subtitle={user.username}
      />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <Card className="overflow-hidden pt-0 shadow-sm">
          <div className="h-20 bg-linear-to-r from-primary/25 via-primary/10 to-transparent" />
          <CardHeader className="-mt-10 flex flex-row items-end gap-4">
            <Avatar className="size-20 shadow-md ring-4 ring-card">
              <AvatarFallback className="bg-primary text-3xl font-semibold text-primary-foreground uppercase">
                {user.username.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="truncate text-xl">
                {user.username}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant={isAdmin ? "default" : "outline"}>
                  {isAdmin ? t.common.admin : t.common.farmer}
                </Badge>
                <Badge variant={PLAN_STATUS[status]}>{t.status[status]}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label={t.common.username}>{user.username}</Row>
              <Row label={p.phone}>{user.phone ?? p.notGiven}</Row>
              {created && (
                <Row label={p.opened}>{formatIstDate(created, locale)}</Row>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{p.plan}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label={p.plan}>{t.plans[user.plan]}</Row>
              <Row label={p.status}>
                <Badge variant={PLAN_STATUS[status]}>{t.status[status]}</Badge>
              </Row>
              <Row label={isTrial ? p.trialEnd : p.expiry}>
                {expiry ? formatIstDate(expiry, locale) : p.noExpiry}
              </Row>
              <Row label={p.perDay}>{plan.daily}</Row>
              <Row label={plan.perMonth ? p.perMonth : p.perTrial}>
                {hasPeriodLimit(user.plan) ? plan.period : t.common.unlimited}
              </Row>
              <Row label={p.cost}>{p.costValue}</Row>
            </dl>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{p.usage}</CardTitle>
          </CardHeader>
          <CardContent>
            <Meter label={p.usedToday} used={used.today} limit={plan.daily} />
            {hasPeriodLimit(user.plan) && (
              <Meter
                label={plan.perMonth ? p.usedMonth : p.usedTrial}
                used={used.period}
                limit={plan.period}
              />
            )}
            <div className="mt-2 flex items-center justify-between gap-4 rounded-xl bg-primary/10 px-4 py-3">
              <span className="font-medium">{p.leftToday}</span>
              <span className="text-2xl font-bold text-primary tabular-nums">
                {summary.left}
              </span>
            </div>
          </CardContent>
        </Card>

        <ApiKeyCard
          masked={ownKey ? mask(ownKey) : undefined}
          model={byokModelId(aiSettings).replace("google:", "")}
        />

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t.common.language}</CardTitle>
            <CardDescription>{t.common.languageHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageToggle className="h-12 w-full text-base sm:w-auto" />
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{t.common.admin}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline" className="h-12 text-base">
                <Link href="/admin">
                  <ShieldIcon />
                  {t.common.users}
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 text-base">
                <Link href="/admin/ai">
                  <BotIcon />
                  {t.common.aiSettings}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </PageShell>
  )
}
