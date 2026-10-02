import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeftIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

// Sticky top bar shared by profile / admin pages (same look as the chat header).
export function PageHeader({
  backHref,
  backLabel,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  backHref: string
  backLabel: string
  icon: LucideIcon
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-10 rounded-xl"
        >
          <Link href={backHref} aria-label={backLabel}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg leading-tight font-semibold">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {children && (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        )}
      </div>
    </header>
  )
}

// Full-width muted background with a centred content column.
export function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-muted dark:bg-background">{children}</div>
}
