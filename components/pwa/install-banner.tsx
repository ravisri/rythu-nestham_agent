"use client"

import { useEffect, useState } from "react"
import { DownloadIcon, ShareIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { usePwaInstall } from "@/hooks/use-pwa-install"
import { useI18n } from "@/lib/i18n/client"

const KEY = "pwaBannerHiddenUntil"
const WEEK = 7 * 24 * 60 * 60 * 1000

// "Install the app" card for the welcome screen. iOS has no install event, so
// it shows the Share -> Add to Home Screen hint instead.
export function InstallBanner() {
  const { t } = useI18n()
  const { canInstall, isIOS, install } = usePwaInstall()
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    try {
      setHidden(Number(localStorage.getItem(KEY) ?? 0) > Date.now())
    } catch {
      setHidden(false)
    }
  }, [])

  function later() {
    setHidden(true)
    try {
      localStorage.setItem(KEY, String(Date.now() + WEEK))
    } catch {}
  }

  if (hidden || (!canInstall && !isIOS)) return null

  return (
    <Card className="border-primary/30 py-3 shadow-sm">
      <CardContent className="flex items-center gap-3 px-3 relative">
        <div className="flex w-full items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="flex flex-1 items-center gap-2 justify-start">
        <img
          src="/icons/icon-192.png"
          alt=""
          className="size-12 shrink-0 rounded-xl shadow-sm"
        />
        <div className="min-w-0 flex-1 items-start text-left">
          <p className="leading-tight font-semibold">{t.pwa.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isIOS ? (
              <>
                <ShareIcon className="inline size-4 align-text-bottom" />{" "}
                {t.pwa.iosHint}
              </>
            ) : (
              t.pwa.body
            )}
          </p>
        </div>
        </div>
        {canInstall && (
          <Button className="h-10 shrink-0 rounded-full px-4" onClick={install}>
            <DownloadIcon />
            {t.pwa.install}
          </Button>
        )}
         <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-full"
          aria-label={t.pwa.later}
          onClick={later}
        >
          <XIcon />
        </Button>
        </div>
       
      </CardContent>
    </Card>
  )
}
