"use client"

import { BookOpenIcon, Share2Icon, SquareIcon, Volume2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export function Actions({
  text,
  speaking,
  canSpeak,
  onSpeak,
  onStop,
}: {
  text: string
  speaking: boolean
  canSpeak: boolean
  onSpeak: () => void
  onStop: () => void
}) {
  // WhatsApp bold is *single* asterisks.
  const shared = `${text.replace(/\*\*(.+?)\*\*/g, "*$1*")}\n\n— రైతు నేస్తం`
  return (
    <div className="flex flex-wrap gap-2">
      {canSpeak && (
        <Button
          variant="secondary"
          className="h-11 gap-2 rounded-full px-5 text-base"
          onClick={speaking ? onStop : onSpeak}
        >
          {speaking ? <SquareIcon /> : <Volume2Icon />}
          {speaking ? "ఆపండి" : "వినండి"}
        </Button>
      )}
      <Button variant="outline" className="h-11 gap-2 rounded-full px-5 text-base" asChild>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shared)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Share2Icon />
          షేర్
        </a>
      </Button>
    </div>
  )
}

export function Sources({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      <BookOpenIcon className="size-4" />
      ఆధారం:
      {sources.map((source) => (
        <Badge key={source} variant="secondary">
          {source}
        </Badge>
      ))}
    </div>
  )
}
