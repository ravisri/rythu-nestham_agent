"use client"

import { LanguagesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useI18n, useSwitchLocale } from "@/lib/i18n/client"

// Switches static UI text only; AI answers stay Telugu.
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, t } = useI18n()
  const { switchLocale, pending } = useSwitchLocale()

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={switchLocale}
      disabled={pending}
      lang={locale === "te" ? "en" : "te"}
    >
      {pending ? <Spinner /> : <LanguagesIcon />}
      {t.common.switchTo}
    </Button>
  )
}
