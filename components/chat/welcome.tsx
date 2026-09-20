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

const STEPS = [
  "ప్రశ్న చెప్పండి లేదా ఫోటో పంపండి",
  "ANGRAU / ICAR సమాచారంతో AI పరిశీలిస్తుంది",
  "తెలుగులో సలహా చదవండి, వినండి",
]

const EXAMPLES: { icon: LucideIcon; label: string; text: string }[] = [
  {
    icon: WheatIcon,
    label: "వరి ఆకులపై మచ్చలు",
    text: "వరి ఆకులపై గోధుమ రంగు మచ్చలు వచ్చాయి. ఏం చేయాలి?",
  },
  {
    icon: BugIcon,
    label: "పత్తిలో పురుగులు",
    text: "పత్తి పంటలో రసం పీల్చే పురుగులు ఆశిస్తున్నాయి. తక్కువ ఖర్చుతో నివారణ ఏమిటి?",
  },
  {
    icon: LeafIcon,
    label: "మిర్చి ఆకు ముడత",
    text: "మిర్చి ఆకులు ముడుచుకుపోతున్నాయి. కారణం, పరిష్కారం ఏమిటి?",
  },
  {
    icon: DropletsIcon,
    label: "సేంద్రీయ మందు తయారీ",
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
  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <SproutIcon className="size-9" />
        </span>
        <h2 className="text-2xl font-semibold">నమస్కారం రైతన్నా!</h2>
        <p className="text-muted-foreground">
          మీ పంట సమస్య ఏమిటి? చెప్పండి లేదా ఫోటో పంపండి.
          <br />
          సులభమైన, తక్కువ ఖర్చు పరిష్కారం ఇస్తాను.
        </p>
      </div>

      <div className={`grid gap-3 ${micSupported ? "grid-cols-2" : "grid-cols-1"}`}>
        {micSupported && (
          <Button
            className="h-24 flex-col gap-2 rounded-2xl text-lg"
            onClick={onMic}
          >
            <MicIcon className="size-8" />
            మాట్లాడండి
          </Button>
        )}
        <Button
          variant="secondary"
          className="h-24 flex-col gap-2 rounded-2xl text-lg"
          onClick={onCamera}
        >
          <CameraIcon className="size-8" />
          ఫోటో పంపండి
        </Button>
      </div>

      <ol className="space-y-2">
        {STEPS.map((step, i) => (
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
          ఉదాహరణలు — నొక్కండి:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map(({ icon: Icon, label, text }) => (
            <Button
              key={label}
              variant="outline"
              className="h-auto min-h-14 justify-start gap-3 rounded-xl px-3 py-3 text-left text-base whitespace-normal"
              onClick={() => onPick(text)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
