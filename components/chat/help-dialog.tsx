"use client"

import { CameraIcon, KeyboardIcon, MicIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useI18n } from "@/lib/i18n/client"

// Opened from the profile menu.
export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const steps = [
    { icon: MicIcon, text: t.help.mic },
    { icon: CameraIcon, text: t.help.camera },
    { icon: KeyboardIcon, text: t.help.keyboard },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
