"use client"

import { CameraIcon, CircleHelpIcon, KeyboardIcon, MicIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const STEPS = [
  { icon: MicIcon, text: "‘మాట్లాడండి’ నొక్కి, మీ పంట సమస్యను తెలుగులో చెప్పండి." },
  { icon: CameraIcon, text: "‘ఫోటో’ నొక్కి, ఆకు లేదా పంట ఫోటో పంపండి." },
  { icon: KeyboardIcon, text: "లేదా కింద టైప్ చేసి పంపండి." },
]

export function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-10 rounded-xl"
          aria-label="ఎలా వాడాలి"
        >
          <CircleHelpIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ఎలా వాడాలి?</DialogTitle>
          <DialogDescription>
            సమాధానం తెలుగులో చదవవచ్చు, వినవచ్చు, WhatsApp లో పంపవచ్చు.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {STEPS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <span className="text-base">{text}</span>
            </li>
          ))}
        </ul>
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          మంచి ఫోటో కోసం: పగటి వెలుతురులో, సమస్య ఉన్న ఆకును దగ్గరగా తీయండి. AI సలహా
          మాత్రమే — మందులు వాడే ముందు స్థానిక వ్యవసాయ అధికారిని సంప్రదించండి.
        </p>
      </DialogContent>
    </Dialog>
  )
}
