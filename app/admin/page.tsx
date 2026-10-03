import { BarChart3Icon, BotIcon, SearchIcon, ShieldIcon } from "lucide-react"
import { QuotaAlert } from "@/components/admin/quota-alert"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  CreateUserDialog,
  PasswordDialog,
  PlanForm,
} from "@/components/admin/admin-forms"
import { PageHeader, PageShell } from "@/components/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { getCurrentUser, USER_COLUMNS, type AppUser } from "@/lib/auth"
import { getDictionary } from "@/lib/i18n/server"
import {
  hasPeriodLimit,
  istDay,
  PLAN_STATUS,
  PLANS,
  planStatus,
} from "@/lib/plans"
import { getSupabase } from "@/lib/supabase"
import { quotaAlerts } from "@/lib/token-usage"
import { usedCredits } from "@/lib/usage"

// ISO timestamp -> yyyy-mm-dd in IST (for the date input).
const toDay = (iso: string | null) => (iso ? istDay(new Date(iso)) : "")

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const me = await getCurrentUser()
  if (!me) redirect("/login")
  if (me.role !== "admin") redirect("/")
  const { t } = await getDictionary()

  // Only username/phone characters, so the value is safe inside the filter.
  const q = ((await searchParams).q ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
  let query = getSupabase()
    .from("app_users")
    .select(USER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(50)
  if (q) query = query.or(`username.ilike.%${q}%,phone.ilike.%${q}%`)
  const { data, error } = await query
  if (error) throw error

  const users = data as AppUser[]
  const usage = await usedCredits(users)

  return (
    <PageShell>
      <PageHeader
        backHref="/"
        backLabel={t.common.back}
        icon={ShieldIcon}
        title={t.admin.usersTitle}
      >
        <Button asChild variant="outline" className="h-10">
          <Link href="/admin/usage">
            <BarChart3Icon />
            {t.usage.open}
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-10">
          <Link href="/admin/ai">
            <BotIcon />
            {t.common.aiSettings}
          </Link>
        </Button>
        <CreateUserDialog />
      </PageHeader>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <QuotaAlert alerts={await quotaAlerts()} t={t} />
        <form
          className="flex gap-2 rounded-xl border bg-card p-2 shadow-sm"
          action="/admin"
        >
          <Input
            name="q"
            defaultValue={q}
            placeholder={t.admin.searchPlaceholder}
            className="h-10 bg-background"
          />
          <Button type="submit" variant="secondary" className="h-10">
            <SearchIcon />
            {t.admin.search}
          </Button>
        </form>

        {users.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            {t.admin.noUsers}
          </p>
        )}

        {users.map((user) => {
          const plan = PLANS[user.plan]
          const status = planStatus(user)
          const used = usage.get(user.id)!
          return (
            <Card key={user.id} className="shadow-sm">
              <CardHeader className="flex flex-row flex-wrap items-center gap-2">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/10 font-semibold text-primary uppercase">
                    {user.username.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <CardTitle className="text-lg">{user.username}</CardTitle>
                {user.phone && (
                  <span className="text-sm text-muted-foreground">
                    {user.phone}
                  </span>
                )}
                {user.role === "admin" && <Badge>{t.common.admin}</Badge>}
                <Badge variant="outline">{t.plans[user.plan]}</Badge>
                <Badge variant={PLAN_STATUS[status]}>{t.status[status]}</Badge>
                <div className="ml-auto">
                  <PasswordDialog userId={user.id} username={user.username} />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Progress
                  value={Math.min(100, (used.today / plan.daily) * 100)}
                  aria-label={t.admin.usage(
                    `${used.today}/${plan.daily}`,
                    hasPeriodLimit(user.plan)
                      ? `${used.period}/${plan.period}`
                      : `${used.period}`,
                    plan.perMonth
                  )}
                />
                <p className="text-sm text-muted-foreground">
                  {t.admin.usage(
                    `${used.today}/${plan.daily}`,
                    hasPeriodLimit(user.plan)
                      ? `${used.period}/${plan.period}`
                      : `${used.period}`,
                    plan.perMonth
                  )}
                </p>
                <PlanForm
                  userId={user.id}
                  plan={user.plan}
                  expiresOn={toDay(
                    user.plan === "trial"
                      ? user.trial_ends_at
                      : user.plan_expires_at
                  )}
                />
              </CardContent>
            </Card>
          )
        })}
      </main>
    </PageShell>
  )
}
