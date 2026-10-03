import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import {
  ActivityIcon,
  BarChart3Icon,
  CoinsIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { QuotaAlert } from "@/components/admin/quota-alert"
import { PageHeader, PageShell } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { getAiSettings } from "@/lib/ai-settings"
import { getCurrentUser } from "@/lib/auth"
import { getDictionary } from "@/lib/i18n/server"
import { istDay } from "@/lib/plans"
import {
  guestsToday,
  modelUsage,
  topUsers,
  type ModelUsageRow,
} from "@/lib/token-usage"

const fmt = (n: number) => n.toLocaleString("en-IN")
const total = (r: Pick<ModelUsageRow, "tokens_in" | "tokens_out">) =>
  r.tokens_in + r.tokens_out

function Stat({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon
  label: string
  value: string
  children?: ReactNode
}) {
  return (
    <Card className="gap-2 py-4 shadow-sm">
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          {label}
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {children}
      </CardContent>
    </Card>
  )
}

// Plain table with shadcn tokens (scrolls sideways on phones).
function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {head.map((h, i) => (
              <th
                key={h}
                className={`py-2 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-b last:border-b-0">
              {cells.map((c, i) => (
                <td
                  key={i}
                  className={`py-2 pr-3 ${i > 0 ? "text-right tabular-nums" : ""}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function UsagePage() {
  const me = await getCurrentUser()
  if (!me) redirect("/login")
  if (me.role !== "admin") redirect("/")
  const { t } = await getDictionary()
  const u = t.usage

  const [rows, users, guests, settings] = await Promise.all([
    modelUsage(14),
    topUsers(30),
    guestsToday(),
    getAiSettings(),
  ])

  const today = istDay()
  const todayRows = rows.filter((r) => r.day === today)
  const sum = (list: ModelUsageRow[]) => list.reduce((s, r) => s + total(r), 0)
  const userTokens = sum(todayRows.filter((r) => r.audience === "user"))
  const guestTokens = sum(todayRows.filter((r) => r.audience === "guest"))
  const requests = todayRows.reduce((s, r) => s + r.requests, 0)
  const budget = settings.guestDailyTokens

  // Daily totals per audience for the last 14 days (newest first).
  const days = [...new Set(rows.map((r) => r.day))].map((day) => {
    const list = rows.filter((r) => r.day === day)
    return {
      day,
      users: sum(list.filter((r) => r.audience === "user")),
      guests: sum(list.filter((r) => r.audience === "guest")),
    }
  })
  const maxDay = Math.max(1, ...days.map((d) => d.users + d.guests))

  return (
    <PageShell>
      <PageHeader
        backHref="/admin"
        backLabel={t.common.back}
        icon={BarChart3Icon}
        title={u.title}
        subtitle={u.subtitle}
      />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <QuotaAlert
          alerts={todayRows.filter((r) => r.quota_errors > 0)}
          t={t}
        />

        <div className="grid grid-cols-2 gap-3">
          <Stat
            icon={CoinsIcon}
            label={u.todayTotal}
            value={fmt(userTokens + guestTokens)}
          />
          <Stat
            icon={ActivityIcon}
            label={u.requestsToday}
            value={fmt(requests)}
          />
          <Stat icon={UserIcon} label={u.usersToday} value={fmt(userTokens)} />
          <Stat icon={UsersIcon} label={u.guestsToday} value={fmt(guestTokens)}>
            {budget ? (
              <>
                <Progress value={Math.min(100, (guestTokens / budget) * 100)} />
                <span className="text-xs text-muted-foreground">
                  {u.budget(fmt(guestTokens), fmt(budget))}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {u.noBudget}
              </span>
            )}
          </Stat>
        </div>

        {rows.length === 0 && (
          <p className="py-6 text-center text-muted-foreground">{u.empty}</p>
        )}

        {todayRows.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{u.modelsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table
                head={[u.model, u.requests, u.tokensIn, u.tokensOut, u.errors]}
                rows={todayRows.map((r) => [
                  <div key="m" className="flex flex-col gap-1">
                    <span className="font-mono text-xs break-all">
                      {r.model}
                    </span>
                    <Badge
                      variant={r.audience === "guest" ? "outline" : "secondary"}
                      className="w-fit"
                    >
                      {u.audience[r.audience]}
                    </Badge>
                  </div>,
                  fmt(r.requests),
                  fmt(r.tokens_in),
                  fmt(r.tokens_out),
                  r.errors > 0 ? (
                    <span className="font-semibold text-destructive">
                      {fmt(r.errors)}
                    </span>
                  ) : (
                    "0"
                  ),
                ])}
              />
            </CardContent>
          </Card>
        )}

        {days.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{u.daysTitle}</CardTitle>
              <CardDescription>
                {u.audience.user} / {u.audience.guest}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {days.map((d) => (
                <div key={d.day} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground tabular-nums">
                      {d.day}
                    </span>
                    <span className="tabular-nums">
                      {fmt(d.users)} / {fmt(d.guests)}
                    </span>
                  </div>
                  <Progress value={((d.users + d.guests) / maxDay) * 100} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {users.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{u.usersTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table
                head={[u.user, u.today, u.days30, u.credits]}
                rows={users.map((x) => [
                  <span key="n" className="font-medium">
                    {x.username}
                  </span>,
                  fmt(x.todayTokens),
                  fmt(x.periodTokens),
                  fmt(x.periodCredits),
                ])}
              />
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{u.guestsTitle}</CardTitle>
            <CardDescription>
              {u.guestsSummary(guests.count, guests.questions)}
            </CardDescription>
          </CardHeader>
          {guests.top.length > 0 && (
            <CardContent>
              <Table
                head={[u.guest, u.questions, u.tokens]}
                rows={guests.top.map((g) => [
                  <span key="g" className="font-mono text-xs">
                    #{g.id}
                  </span>,
                  fmt(g.questions),
                  fmt(g.tokens),
                ])}
              />
            </CardContent>
          )}
        </Card>
      </main>
    </PageShell>
  )
}
