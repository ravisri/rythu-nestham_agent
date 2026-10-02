"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { SproutIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import { checkReset, login, resetPassword, signup } from "@/app/login/actions"
import { FormInput } from "@/components/auth/form-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LanguageToggle } from "@/components/language-toggle"
import { getDeviceId } from "@/lib/device"
import { useI18n } from "@/lib/i18n/client"
import {
  forgotSchema,
  loginSchema,
  resetSchema,
  signupSchema,
} from "@/lib/validation"

type Tab = "login" | "signup" | "forgot"

function useGoHome() {
  const router = useRouter()
  return () => {
    router.replace("/")
    router.refresh()
  }
}

function FormAlert({ message }: { message: string | null }) {
  const { tr } = useI18n()
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertDescription className="text-base">{tr(message)}</AlertDescription>
    </Alert>
  )
}

function SubmitButton({
  pending,
  children,
}: {
  pending: boolean
  children: ReactNode
}) {
  return (
    <Button type="submit" disabled={pending} className="h-12 w-full text-base">
      {pending && <Spinner />}
      {children}
    </Button>
  )
}

function LoginForm() {
  const { t } = useI18n()
  const goHome = useGoHome()
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await login(values, getDeviceId())
    if (result.ok) goHome()
    else setError(result.error)
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormInput
          control={form.control}
          name="identifier"
          label={t.auth.identifier}
          autoComplete="username"
          autoCapitalize="none"
        />
        <FormInput
          control={form.control}
          name="password"
          label={t.common.password}
          type="password"
          autoComplete="current-password"
        />
        <FormAlert message={error} />
        <SubmitButton pending={form.formState.isSubmitting}>
          {t.auth.login}
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}

function SignupForm() {
  const { t } = useI18n()
  const goHome = useGoHome()
  const [error, setError] = useState<string | null>(null)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: { username: "", phone: "", password: "", confirm: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await signup(values, getDeviceId())
    if (result.ok) setRecoveryCode(result.recoveryCode)
    else setError(result.error)
  })

  return (
    <>
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <FormInput
            control={form.control}
            name="username"
            label={t.common.username}
            description={t.auth.usernameHint}
            autoComplete="username"
            autoCapitalize="none"
          />
          <FormInput
            control={form.control}
            name="phone"
            label={t.auth.phoneOptional}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
          />
          <FormInput
            control={form.control}
            name="password"
            label={t.common.password}
            description={t.auth.passwordHint}
            type="password"
            autoComplete="new-password"
          />
          <FormInput
            control={form.control}
            name="confirm"
            label={t.auth.confirmPassword}
            type="password"
            autoComplete="new-password"
          />
          <FormAlert message={error} />
          <SubmitButton pending={form.formState.isSubmitting}>
            {t.common.createAccount}
          </SubmitButton>
        </FieldGroup>
      </form>

      <Dialog open={recoveryCode !== null} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t.auth.yourCode}</DialogTitle>
            <DialogDescription className="text-base">
              {t.auth.codeHint}
            </DialogDescription>
          </DialogHeader>
          <p className="py-2 text-center font-mono text-4xl font-bold tracking-[0.3em]">
            {recoveryCode}
          </p>
          <DialogFooter>
            <Button className="h-12 w-full text-base" onClick={goHome}>
              {t.auth.codeSaved}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ForgotForm() {
  const { t } = useI18n()
  const [account, setAccount] = useState<{
    identifier: string
    trusted: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(forgotSchema),
    defaultValues: { identifier: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    const result = await checkReset(values, getDeviceId())
    if (result.ok)
      setAccount({ identifier: values.identifier, trusted: result.trusted })
    else setError(result.error)
  })

  if (account) {
    return <NewPasswordForm {...account} onBack={() => setAccount(null)} />
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <FormInput
          control={form.control}
          name="identifier"
          label={t.auth.identifier}
          autoComplete="username"
          autoCapitalize="none"
        />
        <FormAlert message={error} />
        <SubmitButton pending={form.formState.isSubmitting}>
          {t.auth.continue}
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}

function NewPasswordForm({
  identifier,
  trusted,
  onBack,
}: {
  identifier: string
  trusted: boolean
  onBack: () => void
}) {
  const { t } = useI18n()
  const goHome = useGoHome()
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { identifier, recoveryCode: "", password: "", confirm: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    if (!trusted && values.recoveryCode === "") {
      form.setError("recoveryCode", { message: "6 అంకెల రికవరీ కోడ్ ఇవ్వండి" }) // translated by FormInput
      return
    }
    const result = await resetPassword(values, getDeviceId())
    if (result.ok) goHome()
    else setError(result.error)
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <p className="text-base">
          {t.auth.account} <span className="font-semibold">{identifier}</span>
        </p>
        {!trusted && (
          <FormInput
            control={form.control}
            name="recoveryCode"
            label={t.common.recoveryCode}
            description={t.auth.codeDescription}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
          />
        )}
        <FormInput
          control={form.control}
          name="password"
          label={t.common.newPassword}
          type="password"
          autoComplete="new-password"
        />
        <FormInput
          control={form.control}
          name="confirm"
          label={t.auth.confirmNewPassword}
          type="password"
          autoComplete="new-password"
        />
        <FormAlert message={error} />
        <SubmitButton pending={form.formState.isSubmitting}>
          {t.auth.changePassword}
        </SubmitButton>
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-base"
          onClick={onBack}
        >
          {t.common.back}
        </Button>
      </FieldGroup>
    </form>
  )
}

export function AuthForm() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>("login")

  return (
    <div className="relative min-h-dvh bg-muted dark:bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-primary/20 to-transparent" />
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
        <LanguageToggle className="absolute top-4 right-4 h-10" />
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <SproutIcon className="size-9" />
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t.common.appName}
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              {t.auth.tagline}
            </p>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">
              {tab === "signup"
                ? t.auth.signup
                : tab === "forgot"
                  ? t.auth.forgot
                  : t.auth.login}
            </CardTitle>
            <CardDescription className="text-base">
              {tab === "signup"
                ? t.auth.signupHint
                : tab === "forgot"
                  ? t.auth.forgotHint
                  : t.auth.loginHint}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList className="mb-4 grid h-11 w-full grid-cols-3">
                <TabsTrigger value="login" className="text-base">
                  {t.auth.login}
                </TabsTrigger>
                <TabsTrigger value="signup" className="text-base">
                  {t.auth.signup}
                </TabsTrigger>
                <TabsTrigger value="forgot" className="text-base">
                  {t.auth.forgotTab}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <LoginForm />
              </TabsContent>
              <TabsContent value="signup">
                <SignupForm />
              </TabsContent>
              <TabsContent value="forgot">
                <ForgotForm />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
