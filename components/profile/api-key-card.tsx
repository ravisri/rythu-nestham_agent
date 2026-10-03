"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ExternalLinkIcon,
  KeyRoundIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react"
import { deleteMyApiKey, saveMyApiKey } from "@/app/profile/actions"
import { FormInput } from "@/components/auth/form-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useI18n } from "@/lib/i18n/client"
import { BYOK } from "@/lib/plans"
import { userApiKeySchema } from "@/lib/validation"

// The user's own Google key: step-by-step guide, test & save, delete.
// The model is the admin's choice; users only provide the key.
export function ApiKeyCard({
  masked: initialMasked,
  model,
}: {
  masked?: string
  model: string
}) {
  const { t, tr } = useI18n()
  const b = t.byok
  const [masked, setMasked] = useState(initialMasked)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [removing, setRemoving] = useState(false)
  const form = useForm({
    resolver: zodResolver(userApiKeySchema),
    defaultValues: { apiKey: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    setSaved(false)
    const result = await saveMyApiKey(values)
    if (!result.ok) return setError(result.error)
    setMasked(result.masked)
    setSaved(true)
    form.reset({ apiKey: "" }) // never keep the key in the form
  })

  async function remove() {
    setRemoving(true)
    setError(null)
    const result = await deleteMyApiKey()
    setRemoving(false)
    if (!result.ok) return setError(result.error)
    setMasked(undefined)
    setSaved(false)
  }

  return (
    <Card id="api-key" className="scroll-mt-20 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-5 text-primary" />
          {b.title}
        </CardTitle>
        <CardDescription>{b.hint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{b.model}:</span>
          <Badge variant="secondary" className="font-mono">
            {model}
          </Badge>
          <span>· {b.perDay(BYOK.daily)}</span>
        </div>

        {masked && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {b.current}:
              </span>
              <span className="font-mono font-semibold">{masked}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={removing}
              onClick={remove}
            >
              {removing ? <Spinner /> : <Trash2Icon />}
              {b.remove}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <p className="font-medium">{b.stepsTitle}</p>
          <ol className="space-y-2">
            {b.steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLinkIcon />
              {b.openStudio}
            </a>
          </Button>
        </div>

        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>{b.warnTitle}</AlertTitle>
          <AlertDescription>{b.warnBody}</AlertDescription>
        </Alert>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <FormInput
            control={form.control}
            name="apiKey"
            label={b.label}
            placeholder={b.placeholder}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{tr(error)}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <p className="text-sm font-medium text-primary">{b.saved}</p>
          )}
          <Button
            type="submit"
            className="h-12 text-base"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Spinner />}
            {b.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
