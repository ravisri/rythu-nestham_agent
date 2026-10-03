"use client"

import { CornerDownRightIcon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n/client"

// AI-suggested follow-up questions under the latest answer; a tap asks it.
export function NextQuestions({
  questions,
  disabled,
  onPick,
}: {
  questions: string[]
  disabled?: boolean
  onPick: (question: string) => void
}) {
  const { t } = useI18n()
  if (questions.length === 0) return null
  return (
    <section className="space-y-2 pt-1">
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <SparklesIcon className="size-4 text-primary" />
        {t.chat.nextTitle}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {questions.map((q) => (
          <Button
            key={q}
            variant="outline"
            disabled={disabled}
            className="group h-auto min-h-16 flex-col items-start justify-between gap-2 rounded-2xl bg-card p-3 text-left text-base whitespace-normal shadow-xs hover:border-primary/40"
            onClick={() => onPick(q)}
          >
            <span className="font-normal">{q}</span>
            <CornerDownRightIcon className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
          </Button>
        ))}
      </div>
    </section>
  )
}
