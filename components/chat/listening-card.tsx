"use client"

import { MicIcon, SquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function ListeningCard({
  transcript,
  onStop,
}: {
  transcript: string
  onStop: () => void
}) {
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex items-center gap-4">
        <span className="relative flex size-14 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
          <span className="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MicIcon className="size-7" />
          </span>
        </span>
        <p className="min-w-0 flex-1 text-base leading-snug">
          {transcript || "చెప్పండి, వింటున్నాను…"}
        </p>
        <Button
          variant="destructive"
          className="h-12 shrink-0 gap-2 rounded-xl px-4 text-base"
          onClick={onStop}
        >
          <SquareIcon className="size-4" />
          ఆపండి
        </Button>
      </CardContent>
    </Card>
  )
}
