import { ArrowLeftIcon, BotIcon, ShieldIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { LanguageToggle } from "@/components/language-toggle"
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
import { getCurrentUser } from "@/lib/auth"
import { getDictionary } from "@/lib/i18n/server"
import { formatIstDate, PLAN_STATUS, PLANS, planStatus } from "@/lib/plans"
import { getSupabase } from "@/lib/supabase"
import { usageSummary, usedCredits } from "@/lib/usage"

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
  const [used, summary, created] = await Promise.all([
    usedCredits([user]).then((m) => m.get(user.id)!),
    usageSummary(user),
    getSupabase()
      .from("app_users")
      .select("created_at")
      .eq("id", user.id)
      .single()
      .then(({ data }) => (data?.created_at as string | undefined) ?? null),
  ])

  const plan = PLANS[user.plan]
  const status = planStatus(user)
  const isAdmin = user.role === "admin"
  const isTrial = user.plan === "trial"
  const expiry = isTrial ? user.trial_ends_at : user.plan_expires_at
  const p = t.profile

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 bg-muted p-4 dark:bg-background">
      <header className="flex items-center gap-3">
        <Button asChild variant="outline" size="icon" className="size-10">
          <Link href="/" aria-label={t.common.back}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="flex-1 text-xl font-semibold">{t.common.myProfile}</h1>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="bg-primary text-2xl font-semibold text-primary-foreground uppercase">
              {user.username.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="truncate text-xl">{user.username}</CardTitle>
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
            {created && <Row label={p.opened}>{formatIstDate(created, locale)}</Row>}
          </dl>
        </CardContent>
      </Card>

      <Card>
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
            <Row label={plan.perMonth ? p.perMonth : p.perTrial}>{plan.period}</Row>
            <Row label={p.cost}>{p.costValue}</Row>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{p.usage}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <Row label={p.usedToday}>
              {used.today}/{plan.daily}
            </Row>
            <Row label={plan.perMonth ? p.usedMonth : p.usedTrial}>
              {used.period}/{plan.period}
            </Row>
            <Row label={p.leftToday}>
              <span className="text-lg text-primary">{summary.left}</span>
            </Row>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.common.language}</CardTitle>
          <CardDescription>{t.common.languageHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageToggle className="h-12 w-full text-base sm:w-auto" />
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
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
  )
}
