"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CheckIcon, PlugZapIcon, Trash2Icon, Undo2Icon } from "lucide-react"
import { useId, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { saveAiSettings, testAiConnection } from "@/app/admin/actions"
import { FormInput } from "@/components/auth/form-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  AI_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  type AiProvider,
} from "@/lib/ai-models"
import { useI18n } from "@/lib/i18n/client"
import { aiSettingsSchema, type AiSettingsValues } from "@/lib/validation"

export type KeyStatus = {
  source: "db" | "env" | "none" | "unreadable"
  masked: string
}

const SOURCE = {
  db: { label: "keySaved", variant: "default" },
  env: { label: "keyEnv", variant: "secondary" },
  none: { label: "keyNone", variant: "outline" },
  unreadable: { label: "keyUnreadable", variant: "destructive" },
} as const

const CUSTOM = "__custom"
const NO_KEYS = { google: "", openai: "", anthropic: "", compat: "" }

const useAiForm = (defaultValues: AiSettingsValues) =>
  useForm({ resolver: zodResolver(aiSettingsSchema), defaultValues })
type AiForm = ReturnType<typeof useAiForm>

function ModelPicker({
  form,
  role,
  title,
  description,
  providers = AI_PROVIDERS,
}: {
  form: AiForm
  role: "chat" | "ocr" | "guest" | "byok"
  title: string
  description: string
  // Limit the provider list (users' own keys: Google only).
  providers?: readonly AiProvider[]
}) {
  const id = useId()
  const { t } = useI18n()
  const providerName = `${role}Provider` as const
  const modelName = `${role}Model` as const
  const provider = useWatch({ control: form.control, name: providerName })
  const model = useWatch({ control: form.control, name: modelName })
  const [custom, setCustom] = useState(
    () => !PROVIDER_MODELS[provider].includes(model)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
          <Controller
            control={form.control}
            name={providerName}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor={`${id}-p`}>{t.ai.provider}</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={(value: AiProvider) => {
                    field.onChange(value)
                    form.setValue(modelName, PROVIDER_MODELS[value][0])
                    setCustom(false)
                  }}
                >
                  <SelectTrigger
                    id={`${id}-p`}
                    className="h-12 w-full text-base"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PROVIDER_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Field>
            <FieldLabel htmlFor={`${id}-m`}>{t.ai.model}</FieldLabel>
            <Select
              value={custom ? CUSTOM : model}
              onValueChange={(value) => {
                setCustom(value === CUSTOM)
                if (value !== CUSTOM) form.setValue(modelName, value)
              }}
            >
              <SelectTrigger id={`${id}-m`} className="h-12 w-full text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_MODELS[provider].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>{t.ai.customModel}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {custom && (
            <div className="sm:col-span-2">
              <FormInput
                control={form.control}
                name={modelName}
                label={t.ai.modelName}
                placeholder={t.ai.modelExample}
                autoCapitalize="none"
                autoComplete="off"
              />
            </div>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function KeyRow({
  form,
  provider,
  status,
}: {
  form: AiForm
  provider: AiProvider
  status: KeyStatus
}) {
  const { t, tr } = useI18n()
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null
  )
  const clearKeys = useWatch({ control: form.control, name: "clearKeys" })
  const removing = clearKeys.includes(provider)
  const source = SOURCE[status.source]

  // Test with the model this provider is chosen for, else its first suggestion.
  async function test() {
    const v = form.getValues()
    const model =
      v.chatProvider === provider
        ? v.chatModel
        : v.ocrProvider === provider
          ? v.ocrModel
          : PROVIDER_MODELS[provider][0]
    setTesting(true)
    setResult(null)
    const res = await testAiConnection({
      provider,
      model,
      apiKey: v.apiKeys[provider],
      compatBaseUrl: v.compatBaseUrl,
    })
    setTesting(false)
    setResult(
      res.ok
        ? { ok: true, text: t.ai.connected(model) }
        : { ok: false, text: res.error }
    )
  }

  const toggleRemove = () =>
    form.setValue(
      "clearKeys",
      removing
        ? clearKeys.filter((p) => p !== provider)
        : [...clearKeys, provider]
    )

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{PROVIDER_LABELS[provider]}</span>
        <Badge variant={source.variant}>{t.ai[source.label]}</Badge>
        {status.masked && (
          <span className="font-mono text-sm text-muted-foreground">
            {status.masked}
          </span>
        )}
        {removing && <Badge variant="destructive">{t.ai.willRemove}</Badge>}
      </div>
      <FormInput
        control={form.control}
        name={`apiKeys.${provider}`}
        label={t.ai.newKey}
        type="password"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
      />
      {provider === "compat" && (
        <FormInput
          control={form.control}
          name="compatBaseUrl"
          label="Base URL"
          placeholder="https://api.groq.com/openai/v1"
          autoCapitalize="none"
          autoComplete="off"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={test}
          disabled={testing}
        >
          {testing ? <Spinner /> : <PlugZapIcon />}
          {t.ai.test}
        </Button>
        {status.source === "db" && (
          <Button type="button" variant="outline" onClick={toggleRemove}>
            {removing ? <Undo2Icon /> : <Trash2Icon />}
            {removing ? t.ai.keep : t.ai.removeSaved}
          </Button>
        )}
      </div>
      {result && (
        <p
          className={
            result.ok ? "text-sm text-primary" : "text-sm text-destructive"
          }
        >
          {result.ok ? result.text : tr(result.text)}
        </p>
      )}
    </div>
  )
}

export function AiSettingsForm({
  chat,
  ocr,
  guest,
  guestDailyTokens,
  byokModel,
  embedding,
  compatBaseUrl,
  keys,
}: {
  chat: { provider: AiProvider; model: string }
  ocr: { provider: AiProvider; model: string }
  guest: { provider: AiProvider; model: string }
  guestDailyTokens: string
  byokModel: string
  embedding: string
  compatBaseUrl: string
  keys: Record<AiProvider, KeyStatus>
}) {
  const { t, tr } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const form = useAiForm({
    chatProvider: chat.provider,
    chatModel: chat.model,
    ocrProvider: ocr.provider,
    ocrModel: ocr.model,
    guestProvider: guest.provider,
    guestModel: guest.model,
    guestDailyTokens,
    byokProvider: "google",
    byokModel,
    compatBaseUrl,
    apiKeys: NO_KEYS,
    clearKeys: [],
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    setSaved(false)
    const result = await saveAiSettings(values)
    if (!result.ok) return setError(result.error)
    setSaved(true)
    // Typed keys are now stored (encrypted); never keep them in the form.
    form.reset({ ...values, apiKeys: NO_KEYS, clearKeys: [] })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <ModelPicker
        form={form}
        role="chat"
        title={t.ai.chatTitle}
        description={t.ai.chatHint}
      />
      <ModelPicker
        form={form}
        role="ocr"
        title={t.ai.ocrTitle}
        description={t.ai.ocrHint}
      />
      <ModelPicker
        form={form}
        role="guest"
        title={t.ai.guestTitle}
        description={t.ai.guestHint}
      />
      <ModelPicker
        form={form}
        role="byok"
        title={t.ai.byokTitle}
        description={t.ai.byokHint}
        providers={["google"]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t.ai.guestBudgetTitle}</CardTitle>
          <CardDescription>{t.ai.guestBudgetHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <FormInput
            control={form.control}
            name="guestDailyTokens"
            label={t.ai.guestBudgetLabel}
            placeholder="500000"
            inputMode="numeric"
            autoComplete="off"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.ai.keysTitle}</CardTitle>
          <CardDescription>{t.ai.keysHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {AI_PROVIDERS.map((provider) => (
            <KeyRow
              key={provider}
              form={form}
              provider={provider}
              status={keys[provider]}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.ai.embeddingTitle}</CardTitle>
          <CardDescription>
            <span className="font-mono">{embedding}</span> {t.ai.embeddingHint}
          </CardDescription>
        </CardHeader>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{tr(error)}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        className="h-12 text-base"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? <Spinner /> : saved && <CheckIcon />}
        {saved ? t.ai.savedDone : t.ai.save}
      </Button>
    </form>
  )
}
