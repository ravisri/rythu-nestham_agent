"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { KeyRoundIcon, UserPlusIcon } from "lucide-react"
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
  return (
    <Controller
      control={control}
      name={"plan" as Path<T>}
      render={({ field }) => (
        <Field>
          <FieldLabel htmlFor={id}>ప్లాన్</FieldLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={id} className="h-12 w-full text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAN_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {PLANS[id].label} ({PLANS[id].daily}/రోజు, {PLANS[id].period}
                  {PLANS[id].perMonth ? "/నెల" : " మొత్తం"})
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
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }
  if (!code) return null
  return (
    <Alert>
      <AlertDescription>
        రికవరీ కోడ్ (యూజర్‌కు ఇవ్వండి):{" "}
        <span className="font-mono text-lg font-bold tracking-widest">
          {code}
        </span>
      </AlertDescription>
    </Alert>
  )
}

export function CreateUserDialog() {
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
          కొత్త యూజర్
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>కొత్త యూజర్ ఖాతా</DialogTitle>
          <DialogDescription>
            యూజర్‌నేమ్, పాస్‌వర్డ్ యూజర్‌కు తెలియజేయండి.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <FormInput
              control={form.control}
              name="username"
              label="యూజర్‌నేమ్"
              autoCapitalize="none"
            />
            <FormInput
              control={form.control}
              name="phone"
              label="ఫోన్ (ఐచ్ఛికం)"
              type="tel"
              inputMode="numeric"
            />
            <FormInput
              control={form.control}
              name="password"
              label="పాస్‌వర్డ్"
              type="text"
              autoComplete="off"
            />
            <PlanSelect control={form.control} />
            <Message error={error} code={code} />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              ఖాతా తెరవండి
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
          label={form.watch("plan") === "trial" ? "ట్రయల్ ముగింపు" : "గడువు (ఖాళీ = లేదు)"}
          type="date"
        />
        <Button
          type="submit"
          variant="secondary"
          className="h-12"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && <Spinner />}
          {saved ? "సేవ్ అయింది ✓" : "సేవ్"}
        </Button>
      </FieldGroup>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </form>
  )
}

export function PasswordDialog({
  userId,
  username,
}: {
  userId: string
  username: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(adminPasswordSchema),
    defaultValues: { userId, password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await resetUserPassword(values)
    if (!result.ok) return setError(result.error)
    setCode(result.recoveryCode)
    form.reset({ userId, password: "" })
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
        <Button variant="outline" size="sm">
          <KeyRoundIcon />
          పాస్‌వర్డ్
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{username} పాస్‌వర్డ్ మార్చండి</DialogTitle>
          <DialogDescription>
            యూజర్ అన్ని ఫోన్‌ల నుండి లాగౌట్ అవుతారు. కొత్త రికవరీ కోడ్ వస్తుంది.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <FormInput
              control={form.control}
              name="password"
              label="కొత్త పాస్‌వర్డ్"
              type="text"
              autoComplete="off"
            />
            <Message error={error} code={code} />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              మార్చండి
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
