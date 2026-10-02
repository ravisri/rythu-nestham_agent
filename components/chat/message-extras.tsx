"use client"

import {
  BookOpenIcon,
  ChevronDownIcon,
  Share2Icon,
  SquareIcon,
  Volume2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useI18n } from "@/lib/i18n/client"

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
  const { t } = useI18n()
  // Shared answer stays Telugu (it is the AI answer). WhatsApp bold is *single* asterisks.
  const shared = `${text.replace(/\*\*(.+?)\*\*/g, "*$1*")}\n\n— రైతు నేస్తం`
  const pill = "h-11 gap-2 rounded-full px-5 text-base"
  return (
    <div className="flex flex-wrap gap-2">
      {canSpeak && (
        <Button
          variant={speaking ? "default" : "secondary"}
          className={`${pill} ${speaking ? "" : "bg-primary/10 text-primary hover:bg-primary/15"}`}
          onClick={speaking ? onStop : onSpeak}
        >
          {speaking ? <SquareIcon /> : <Volume2Icon />}
          {speaking ? t.chat.stop : t.chat.listen}
        </Button>
      )}
      <Button variant="outline" className={`${pill} bg-card`} asChild>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(shared)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Share2Icon />
          {t.chat.share}
        </a>
      </Button>
    </div>
  )
}

export function Sources({ sources }: { sources: string[] }) {
  const { t } = useI18n()
  if (sources.length === 0) return null
  const count = t.chat.sourcesCount(sources.length)
  // Only the count is shown; names open on tap (a tooltip can't be tapped on phones).
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-full bg-card px-3 text-sm text-muted-foreground"
          aria-label={count}
        >
          <BookOpenIcon className="text-primary" />
          {count}
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2 text-sm">
            <BookOpenIcon className="size-4 text-primary" />
            {t.chat.sourcesTitle}
          </PopoverTitle>
        </PopoverHeader>
        <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {sources.map((source, i) => (
            <li key={source} className="flex gap-2 wrap-break-word">
              <span className="font-medium text-primary tabular-nums">
                {i + 1}.
              </span>
              <span className="min-w-0">{source}</span>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  )
}
