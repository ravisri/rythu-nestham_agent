"use client"

import Link from "next/link"
import { KeyRoundIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n/client"

// Shown when a logged-in user's free daily questions are used up and they
// have no own Google key yet.
export function OwnKeyCard() {
  const { t } = useI18n()
  return (
    <Card className="mx-auto w-full max-w-5xl border-primary/30 py-3 shadow-sm">
      <CardContent className="flex flex-wrap items-center gap-3 px-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRoundIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="leading-tight font-semibold">{t.byok.cardTitle}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t.byok.cardBody}
          </p>
        </div>
        <Button asChild className="h-11 rounded-full px-5">
          <Link href="/profile#api-key">
            <KeyRoundIcon />
            {t.byok.cardButton}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
