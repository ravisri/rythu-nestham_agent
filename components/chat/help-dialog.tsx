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
import { useI18n } from "@/lib/i18n/client"

export function HelpDialog() {
  const { t } = useI18n()
  const steps = [
    { icon: MicIcon, text: t.help.mic },
    { icon: CameraIcon, text: t.help.camera },
    { icon: KeyboardIcon, text: t.help.keyboard },
  ]
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-10 rounded-xl"
          aria-label={t.help.open}
        >
          <CircleHelpIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.help.title}</DialogTitle>
          <DialogDescription>
            {t.help.body}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {steps.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <span className="text-base">{text}</span>
            </li>
          ))}
        </ul>
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {t.help.tip}
        </p>
      </DialogContent>
    </Dialog>
  )
}
