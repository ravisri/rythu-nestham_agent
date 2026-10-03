"use client"

import {
  BugIcon,
  CameraIcon,
  ChevronRightIcon,
  DropletsIcon,
  LeafIcon,
  MicIcon,
  SparklesIcon,
  SproutIcon,
  WheatIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { GiftIcon } from "lucide-react"
import { InstallBanner } from "@/components/pwa/install-banner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useI18n } from "@/lib/i18n/client"
import { GUEST } from "@/lib/plans"

// text = the question sent to the AI: always Telugu (RAG data is Telugu).
// The button label comes from t.welcome.exampleLabels (same order).
const EXAMPLES: { icon: LucideIcon; text: string }[] = [
  {
    icon: WheatIcon,
    text: "వరి ఆకులపై గోధుమ రంగు మచ్చలు వచ్చాయి. ఏం చేయాలి?",
  },
  {
    icon: BugIcon,
    text: "పత్తి పంటలో రసం పీల్చే పురుగులు ఆశిస్తున్నాయి. తక్కువ ఖర్చుతో నివారణ ఏమిటి?",
  },
  {
    icon: LeafIcon,
    text: "మిర్చి ఆకులు ముడుచుకుపోతున్నాయి. కారణం, పరిష్కారం ఏమిటి?",
  },
  {
    icon: DropletsIcon,
    // Covered by data/pdfs/organic (నీమాస్త్రం = neem-based organic pesticide).
    text: "నీమాస్త్రం (వేప కషాయం) తక్కువ ఖర్చుతో ఎలా తయారు చేసి పిచికారీ చేయాలి?",
  },
]

export function Welcome({
  micSupported,
  onMic,
  onCamera,
  onPick,
  guestLeft,
}: {
  // Set for guests (not logged in): free questions left today.
  guestLeft?: number
  micSupported: boolean
  onMic: () => void
  onCamera: () => void
  onPick: (text: string) => void
}) {
  const { t } = useI18n()
  const tile =
    "h-auto flex-col gap-1 rounded-2xl py-3 text-lg font-semibold shadow-sm"
  const tileIcon = "flex size-10 items-center justify-center rounded-full"

  return (
    <div className="flex w-full max-w-5xl flex-col gap-5 py-2">
      <InstallBanner />
      <Card className="relative overflow-hidden border-primary/20 bg-linear-to-br from-primary/15 via-primary/5 to-card shadow-sm py-3">
        <CardContent className="flex flex-col items-center gap-2 text-center ">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <SproutIcon className="size-9" />
          </span>
          <h2 className="text-2xl font-bold tracking-tight">
            {t.welcome.hello}
          </h2>
          <p className="max-w-xl text-base text-muted-foreground leading-[110%]">
            {t.welcome.ask}
            <br />
            {t.welcome.promise}
          </p>
        </CardContent>
      </Card>

      {guestLeft !== undefined && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-card px-4 py-3 shadow-sm">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GiftIcon className="size-5" />
          </span>
          <div className="flex flex-1 justify-between max-sm:flex-col gap-2">
          <div className="min-w-0 flex-1 text-left gap-1.5">
            <p className="flex items-start font-semibold">
              {t.guest.banner(GUEST.daily)}
            </p>
            <div
              className="mt-1.5 flex items-center gap-1.5"
              aria-label={t.guest.left(guestLeft, GUEST.daily)}
            >
              {Array.from({ length: GUEST.daily }, (_, i) => (
                <span
                  key={i}
                  className={`h-2 w-6 rounded-full ${i < guestLeft ? "bg-primary" : "bg-muted"}`}
                />
              ))}
              <span className="ml-1 text-sm text-muted-foreground tabular-nums">
                {guestLeft}/{GUEST.daily}
              </span>
            </div>
          </div>
          <div className="max-sm:text-left">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-9 rounded-full"
          >
            <Link href="/login?tab=signup">{t.guest.signup}</Link>
          </Button>
          </div>
          </div>
        </div>
      )}

      <div
        className={`grid gap-3 ${micSupported ? "grid-cols-2" : "grid-cols-1"}`}
      >
        {micSupported && (
          <Button className={tile} onClick={onMic}>
            <span className={`${tileIcon} bg-primary-foreground/15`}>
              <MicIcon className="size-6" />
            </span>
            {t.chat.speak}
          </Button>
        )}
        <Button
          variant="outline"
          className={`${tile} bg-card`}
          onClick={onCamera}
        >
          <span className={`${tileIcon} bg-primary/10 text-primary`}>
            <CameraIcon className="size-6" />
          </span>
          {t.welcome.sendPhoto}
        </Button>
      </div>

      <Card className="gap-0 py-2 shadow-sm">
        <CardContent className="px-4">
          <ol>
            {t.welcome.steps.map((step, i) => (
              <li key={step}>
                {i > 0 && <Separator />}
                <div className="flex items-center gap-3 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="text-base">{step}</span>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <SparklesIcon className="size-4 text-primary" />
          {t.welcome.examples}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {EXAMPLES.map(({ icon: Icon, text }, i) => (
            <Button
              key={text}
              variant="outline"
              className="group h-auto min-h-16 justify-start gap-3 rounded-xl bg-card p-3 text-left text-base whitespace-normal shadow-xs hover:border-primary/40"
              onClick={() => onPick(text)}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <span className="flex-1">{t.welcome.exampleLabels[i]}</span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Button>
          ))}
        </div>
      </section>
    </div>
  )
}
