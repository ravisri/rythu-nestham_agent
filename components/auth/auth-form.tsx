"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { SproutIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import {
  checkReset,
  login,
  resetPassword,
  signup,
} from "@/app/login/actions"
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
import { getDeviceId } from "@/lib/device"
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
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertDescription className="text-base">{message}</AlertDescription>
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
          label="యూజర్‌నేమ్ లేదా ఫోన్ నంబర్"
          autoComplete="username"
          autoCapitalize="none"
        />
        <FormInput
          control={form.control}
          name="password"
          label="పాస్‌వర్డ్"
          type="password"
          autoComplete="current-password"
        />
        <FormAlert message={error} />
        <SubmitButton pending={form.formState.isSubmitting}>
          లాగిన్
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}

function SignupForm() {
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
            label="యూజర్‌నేమ్"
            description="ఉదా: ramesh_123 (ఆంగ్ల అక్షరాలు, అంకెలు)"
            autoComplete="username"
            autoCapitalize="none"
          />
          <FormInput
            control={form.control}
            name="phone"
            label="ఫోన్ నంబర్ (ఐచ్ఛికం)"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
          />
          <FormInput
            control={form.control}
            name="password"
            label="పాస్‌వర్డ్"
            description="కనీసం 6 అక్షరాలు లేదా అంకెలు"
            type="password"
            autoComplete="new-password"
          />
          <FormInput
            control={form.control}
            name="confirm"
            label="పాస్‌వర్డ్ మళ్లీ ఇవ్వండి"
            type="password"
            autoComplete="new-password"
          />
          <FormAlert message={error} />
          <SubmitButton pending={form.formState.isSubmitting}>
            ఖాతా తెరవండి
          </SubmitButton>
        </FieldGroup>
      </form>

      <Dialog open={recoveryCode !== null} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>మీ రికవరీ కోడ్</DialogTitle>
            <DialogDescription className="text-base">
              ఈ కోడ్ రాసి పెట్టుకోండి. కొత్త ఫోన్‌లో పాస్‌వర్డ్ మర్చిపోతే ఇది
              అవసరం.
            </DialogDescription>
          </DialogHeader>
          <p className="py-2 text-center font-mono text-4xl font-bold tracking-[0.3em]">
            {recoveryCode}
          </p>
          <DialogFooter>
            <Button className="h-12 w-full text-base" onClick={goHome}>
              రాసుకున్నాను, కొనసాగించండి
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ForgotForm() {
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
    if (result.ok) setAccount({ identifier: values.identifier, trusted: result.trusted })
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
          label="యూజర్‌నేమ్ లేదా ఫోన్ నంబర్"
          autoComplete="username"
          autoCapitalize="none"
        />
        <FormAlert message={error} />
        <SubmitButton pending={form.formState.isSubmitting}>
          కొనసాగించండి
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
  const goHome = useGoHome()
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { identifier, recoveryCode: "", password: "", confirm: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    if (!trusted && values.recoveryCode === "") {
      form.setError("recoveryCode", { message: "6 అంకెల రికవరీ కోడ్ ఇవ్వండి" })
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
          ఖాతా: <span className="font-semibold">{identifier}</span>
        </p>
        {!trusted && (
          <FormInput
            control={form.control}
            name="recoveryCode"
            label="రికవరీ కోడ్"
            description="ఖాతా తెరిచినప్పుడు ఇచ్చిన 6 అంకెల కోడ్"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
          />
        )}
        <FormInput
          control={form.control}
          name="password"
          label="కొత్త పాస్‌వర్డ్"
          type="password"
          autoComplete="new-password"
        />
        <FormInput
          control={form.control}
          name="confirm"
          label="కొత్త పాస్‌వర్డ్ మళ్లీ ఇవ్వండి"
          type="password"
          autoComplete="new-password"
        />
        <FormAlert message={error} />
        <SubmitButton pending={form.formState.isSubmitting}>
          పాస్‌వర్డ్ మార్చండి
        </SubmitButton>
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-base"
          onClick={onBack}
        >
          వెనక్కి
        </Button>
      </FieldGroup>
    </form>
  )
}

export function AuthForm() {
  const [tab, setTab] = useState<Tab>("login")

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-muted p-4 dark:bg-background">
      <div className="flex items-center justify-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <SproutIcon className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">రైతు నేస్తం</h1>
          <p className="text-sm text-muted-foreground">
            పంట సమస్యకు సులభ పరిష్కారం
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {tab === "signup"
              ? "కొత్త ఖాతా"
              : tab === "forgot"
                ? "పాస్‌వర్డ్ మర్చిపోయారా?"
                : "లాగిన్"}
          </CardTitle>
          <CardDescription className="text-base">
            {tab === "signup"
              ? "ఉచిత ట్రయల్‌తో మొదలుపెట్టండి."
              : tab === "forgot"
                ? "మీ యూజర్‌నేమ్ లేదా ఫోన్ నంబర్ ఇవ్వండి."
                : "మీ యూజర్‌నేమ్ లేదా ఫోన్ నంబర్‌తో లాగిన్ అవ్వండి."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="mb-4 grid h-11 w-full grid-cols-3">
              <TabsTrigger value="login" className="text-base">
                లాగిన్
              </TabsTrigger>
              <TabsTrigger value="signup" className="text-base">
                కొత్త ఖాతా
              </TabsTrigger>
              <TabsTrigger value="forgot" className="text-base">
                మర్చిపోయా
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
  )
}
