"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { KeyRoundIcon, ShuffleIcon, UserPlusIcon } from "lucide-react"
import { useId, useState } from "react"
import {
  Controller,
  useForm,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"
import {
  createUser,
  issueRecoveryCode,
  resetUserPassword,
  updatePlan,
} from "@/app/admin/actions"
import { FormInput } from "@/components/auth/form-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n } from "@/lib/i18n/client"
import { PLANS, type Plan } from "@/lib/plans"
import {
  adminCreateSchema,
  adminPasswordSchema,
  adminPlanSchema,
  PLAN_IDS,
} from "@/lib/validation"

function PlanSelect<T extends FieldValues, U extends FieldValues>({
  control,
}: {
  control: Control<T, unknown, U>
}) {
  const id = useId()
  const { t } = useI18n()
  return (
    <Controller
      control={control}
      name={"plan" as Path<T>}
      render={({ field }) => (
        <Field>
          <FieldLabel htmlFor={id}>{t.admin.plan}</FieldLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={id} className="h-12 w-full text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {t.plans[id]}{" "}
                  {t.admin.planOption(PLANS[id].daily, PLANS[id].period, PLANS[id].perMonth)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  )
}

function Message({ error, code }: { error: string | null; code?: string | null }) {
  const { t, tr } = useI18n()
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{tr(error)}</AlertDescription>
      </Alert>
    )
  }
  if (!code) return null
  return (
    <Alert>
      <AlertDescription>
        {t.admin.codeForUser}{" "}
        <span className="font-mono text-lg font-bold tracking-widest">
          {code}
        </span>
      </AlertDescription>
    </Alert>
  )
}

export function CreateUserDialog() {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(adminCreateSchema),
    defaultValues: { username: "", phone: "", password: "", plan: "trial" as Plan },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    setCode(null)
    const result = await createUser(values)
    if (!result.ok) return setError(result.error)
    setCode(result.recoveryCode)
    form.reset()
  })

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setError(null)
          setCode(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-10">
          <UserPlusIcon />
          {t.admin.newUser}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.admin.newUserTitle}</DialogTitle>
          <DialogDescription>
            {t.admin.newUserHint}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <FormInput
              control={form.control}
              name="username"
              label={t.common.username}
              autoCapitalize="none"
            />
            <FormInput
              control={form.control}
              name="phone"
              label={t.admin.phoneOptional}
              type="tel"
              inputMode="numeric"
            />
            <FormInput
              control={form.control}
              name="password"
              label={t.common.password}
              type="text"
              autoComplete="off"
            />
            <PlanSelect control={form.control} />
            <Message error={error} code={code} />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              {t.common.createAccount}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PlanForm({
  userId,
  plan,
  expiresOn,
}: {
  userId: string
  plan: Plan
  expiresOn: string
}) {
  const { t, tr } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const form = useForm({
    resolver: zodResolver(adminPlanSchema),
    defaultValues: { userId, plan, expiresOn },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    setSaved(false)
    const result = await updatePlan(values)
    if (result.ok) setSaved(true)
    else setError(result.error)
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup className="gap-3 sm:grid sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <PlanSelect control={form.control} />
        <FormInput
          control={form.control}
          name="expiresOn"
          label={form.watch("plan") === "trial" ? t.admin.trialEnd : t.admin.expiryOptional}
          type="date"
        />
        <Button
          type="submit"
          variant="secondary"
          className="h-12"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && <Spinner />}
          {saved ? t.common.saved : t.common.save}
        </Button>
      </FieldGroup>
      {error && <p className="mt-2 text-sm text-destructive">{tr(error)}</p>}
    </form>
  )
}

// Easy for farmers to type and read aloud: 6 random digits.
function randomPassword() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, "0")
}

// Lost password and/or recovery code. Default tab = new recovery code only,
// so the user sets their own password via "పాస్‌వర్డ్ మర్చిపోయారా?".
export function PasswordDialog({
  userId,
  username,
}: {
  userId: string
  username: string
}) {
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [issuing, setIssuing] = useState(false)
  const form = useForm({
    resolver: zodResolver(adminPasswordSchema),
    defaultValues: { userId, password: "" },
  })

  const clear = () => {
    setError(null)
    setCode(null)
    setNewPassword(null)
  }

  async function issueCode() {
    clear()
    setIssuing(true)
    const result = await issueRecoveryCode({ userId })
    setIssuing(false)
    if (!result.ok) return setError(result.error)
    setCode(result.recoveryCode)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    clear()
    const result = await resetUserPassword(values)
    if (!result.ok) return setError(result.error)
    setNewPassword(values.password)
    setCode(result.recoveryCode)
    form.reset({ userId, password: "" })
  })

  return (
    <Dialog onOpenChange={(open) => !open && clear()}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRoundIcon />
          {t.admin.recovery}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.admin.recoveryTitle(username)}</DialogTitle>
          <DialogDescription>
            {t.admin.verifyFirst}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="code" onValueChange={clear}>
          <TabsList className="w-full">
            <TabsTrigger value="code">{t.common.recoveryCode}</TabsTrigger>
            <TabsTrigger value="password">{t.common.newPassword}</TabsTrigger>
          </TabsList>

          <TabsContent value="code">
            <FieldGroup>
              <p className="text-sm text-muted-foreground">
                {t.admin.codeHelp}
              </p>
              <Message error={error} code={code} />
              <Button type="button" onClick={issueCode} disabled={issuing}>
                {issuing && <Spinner />}
                {t.admin.issueCode}
              </Button>
            </FieldGroup>
          </TabsContent>

          <TabsContent value="password">
            <form onSubmit={onSubmit} noValidate>
              <FieldGroup>
                <p className="text-sm text-muted-foreground">
                  {t.admin.passwordHelp}
                </p>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <FormInput
                      control={form.control}
                      name="password"
                      label={t.common.newPassword}
                      type="text"
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-7 h-12"
                    onClick={() =>
                      form.setValue("password", randomPassword(), {
                        shouldValidate: true,
                      })
                    }
                  >
                    <ShuffleIcon />
                    {t.admin.generate}
                  </Button>
                </div>
                {newPassword && !error && (
                  <Alert>
                    <AlertDescription>
                      {t.admin.newPasswordIs}{" "}
                      <span className="font-mono text-lg font-bold tracking-widest">
                        {newPassword}
                      </span>
                    </AlertDescription>
                  </Alert>
                )}
                <Message error={error} code={code} />
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Spinner />}
                  {t.admin.change}
                </Button>
              </FieldGroup>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
