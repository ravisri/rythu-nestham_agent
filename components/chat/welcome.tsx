"use client"

import {
  BugIcon,
  CameraIcon,
  DropletsIcon,
  LeafIcon,
  MicIcon,
  SproutIcon,
  WheatIcon,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/client"

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
    text: "తక్కువ ఖర్చుతో వేప నూనె ద్రావణం ఎలా తయారు చేసి పిచికారీ చేయాలి?",
  },
]

export function Welcome({
  micSupported,
  onMic,
  onCamera,
  onPick,
}: {
  micSupported: boolean
  onMic: () => void
  onCamera: () => void
  onPick: (text: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-6 py-2 w-full max-w-5xl">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <SproutIcon className="size-9" />
        </span>
        <h2 className="text-2xl font-semibold">{t.welcome.hello}</h2>
        <p className="text-muted-foreground">
          {t.welcome.ask}
          <br />
          {t.welcome.promise}
        </p>
      </div>

      <div className={`grid gap-3 ${micSupported ? "grid-cols-2" : "grid-cols-1"}`}>
        {micSupported && (
          <Button
            className="h-24 flex-col gap-2 rounded-2xl text-lg"
            onClick={onMic}
          >
            <MicIcon className="size-8" />
            {t.chat.speak}
          </Button>
        )}
        <Button
          variant="secondary"
          className="h-24 flex-col gap-2 rounded-2xl text-lg"
          onClick={onCamera}
        >
          <CameraIcon className="size-8" />
          {t.welcome.sendPhoto}
        </Button>
      </div>

      <ol className="space-y-2">
        {t.welcome.steps.map((step, i) => (
          <li key={step} className="flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          {t.welcome.examples}
        </p>
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {EXAMPLES.map(({ icon: Icon, text }, i) => (
            <Button
              key={text}
              variant="outline"
              className="h-auto min-h-14 justify-start gap-3 rounded-xl p-1.5 sm:p-3 text-left text-base whitespace-normal"
              onClick={() => onPick(text)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              {t.welcome.exampleLabels[i]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
