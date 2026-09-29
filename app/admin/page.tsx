import { ArrowLeftIcon, SearchIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  CreateUserDialog,
  PasswordDialog,
  PlanForm,
} from "@/components/admin/admin-forms"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getCurrentUser, USER_COLUMNS, type AppUser } from "@/lib/auth"
import { istDay, PLANS, planStatus } from "@/lib/plans"
import { getSupabase } from "@/lib/supabase"
import { usedCredits } from "@/lib/usage"

const STATUS = {
  active: { label: "యాక్టివ్", variant: "secondary" },
  trial_over: { label: "ట్రయల్ ముగిసింది", variant: "destructive" },
  expired: { label: "గడువు ముగిసింది", variant: "destructive" },
} as const

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

  // Only username/phone characters, so the value is safe inside the filter.
  const q = ((await searchParams).q ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "")
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
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 bg-muted p-4 dark:bg-background">
      <header className="flex items-center gap-3">
        <Button asChild variant="outline" size="icon" className="size-10">
          <Link href="/" aria-label="వెనక్కి">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="flex-1 text-xl font-semibold">అడ్మిన్ · యూజర్లు</h1>
        <CreateUserDialog />
      </header>

      <form className="flex gap-2" action="/admin">
        <Input
          name="q"
          defaultValue={q}
          placeholder="యూజర్‌నేమ్ లేదా ఫోన్‌తో వెతకండి"
          className="h-10 bg-background"
        />
        <Button type="submit" variant="secondary" className="h-10">
          <SearchIcon />
          వెతకండి
        </Button>
      </form>

      {users.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">
          యూజర్లు ఎవరూ లేరు.
        </p>
      )}

      {users.map((user) => {
        const plan = PLANS[user.plan]
        const status = STATUS[planStatus(user)]
        const used = usage.get(user.id)!
        return (
          <Card key={user.id}>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{user.username}</CardTitle>
              {user.phone && (
                <span className="text-sm text-muted-foreground">
                  {user.phone}
                </span>
              )}
              {user.role === "admin" && <Badge>అడ్మిన్</Badge>}
              <Badge variant="outline">{plan.label}</Badge>
              <Badge variant={status.variant}>{status.label}</Badge>
              <div className="ml-auto">
                <PasswordDialog userId={user.id} username={user.username} />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                ఈరోజు {used.today}/{plan.daily} · {plan.perMonth ? "ఈ నెల" : "ట్రయల్ మొత్తం"}{" "}
                {used.period}/{plan.period} ప్రశ్నలు
              </p>
              <PlanForm
                userId={user.id}
                plan={user.plan}
                expiresOn={toDay(
                  user.plan === "trial" ? user.trial_ends_at : user.plan_expires_at
                )}
              />
            </CardContent>
          </Card>
        )
      })}
    </main>
  )
}
