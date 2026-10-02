"use client"

import { MicAudioLines, SquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n/client"

export function ListeningCard({
  transcript,
  onStop,
}: {
  transcript: string
  onStop: () => void
}) {
  const { t } = useI18n()
  return (
    <Card className="mx-auto max-w-5xl border-primary/40 bg-primary/5 py-4 shadow-sm">
      <CardContent className="flex items-center gap-4 px-4">
        <span className="relative flex size-14 shrink-0 items-center justify-center">
          <span className="absolute -inset-1 animate-ping rounded-full bg-primary/25" />
          <span className="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            <MicAudioLines className="size-7" />
          </span>
        </span>
        <p className="min-w-0 flex-1 rounded-xl bg-background/70 px-3 py-2 text-base leading-snug">
          {transcript || t.chat.listening}
        </p>
        <Button
          variant="destructive"
          className="h-12 shrink-0 gap-2 rounded-xl px-4 text-base"
          onClick={onStop}
        >
          <SquareIcon className="size-4" />
          {t.chat.stop}
        </Button>
      </CardContent>
    </Card>
  )
}
