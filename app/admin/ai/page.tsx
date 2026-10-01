import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  AiSettingsForm,
  type KeyStatus,
} from "@/components/admin/ai-settings-form"
import { Button } from "@/components/ui/button"
import { modelIds } from "@/lib/ai"
import {
  AI_PROVIDERS,
  PROVIDER_ENV_KEYS,
  splitModelId,
  type AiProvider,
} from "@/lib/ai-models"
import { getAiSettings, invalidateAiSettings } from "@/lib/ai-settings"
import { getCurrentUser } from "@/lib/auth"
import { getDictionary } from "@/lib/i18n/server"
import { mask } from "@/lib/secrets"

export default async function AiSettingsPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/login")
  if (me.role !== "admin") redirect("/")
  const { t } = await getDictionary()

  invalidateAiSettings() // always show what is in the DB right now
  const settings = await getAiSettings()
  const ids = modelIds(settings)

  // Only masked keys leave the server.
  const keys = Object.fromEntries(
    AI_PROVIDERS.map((provider): [AiProvider, KeyStatus] => {
      const saved = settings.apiKeys[provider]
      const env = process.env[PROVIDER_ENV_KEYS[provider]]
      if (saved) return [provider, { source: "db", masked: mask(saved) }]
      if (settings.unreadable.includes(provider)) {
        return [provider, { source: "unreadable", masked: "" }]
      }
      if (env) return [provider, { source: "env", masked: mask(env) }]
      return [provider, { source: "none", masked: "" }]
    })
  ) as Record<AiProvider, KeyStatus>

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 bg-muted p-4 dark:bg-background">
      <header className="flex items-center gap-3">
        <Button asChild variant="outline" size="icon" className="size-10">
          <Link href="/admin" aria-label={t.common.back}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="flex-1 text-xl font-semibold">{t.admin.aiTitle}</h1>
      </header>

      <AiSettingsForm
        chat={splitModelId(ids.chat)}
        ocr={splitModelId(ids.ocr)}
        embedding={ids.embedding}
        compatBaseUrl={settings.compatBaseUrl ?? process.env.COMPAT_BASE_URL ?? ""}
        keys={keys}
      />
    </main>
  )
}
