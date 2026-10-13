import { PageShell } from "@/components/page-header"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Shown instantly by loading.tsx while a server page loads. Same layout as the
// real pages (PageHeader + cards / chat), so nothing jumps when they arrive.

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${90 - i * 15}%` }} />
        ))}
      </CardContent>
    </Card>
  )
}

// Profile / admin pages: sticky header + a few cards.
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <PageShell>
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        </div>
      </div>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} lines={i === 0 ? 4 : 3} />
        ))}
      </main>
    </PageShell>
  )
}

// Home chat: app header, a question + answer bubble, input bar.
export function ChatSkeleton() {
  return (
    <div className="mx-auto flex h-dvh w-full flex-col bg-muted dark:bg-background">
      <div className="flex items-center gap-3 border-b bg-background/80 px-4 py-3">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="size-10 rounded-xl" />
      </div>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4">
        <Skeleton className="ml-auto h-12 w-3/5 rounded-2xl rounded-br-md" />
        <div className="flex items-start gap-2">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2 rounded-2xl rounded-tl-md border bg-card p-4">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      </div>
      <div className="border-t bg-background p-3">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 rounded-2xl border p-2">
          <Skeleton className="h-14" />
          <div className="flex gap-2">
            <Skeleton className="h-14 w-20 rounded-xl" />
            <Skeleton className="h-14 w-20 rounded-xl" />
            <Skeleton className="h-14 w-20 rounded-xl" />
            <Skeleton className="ml-auto size-14 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Login: one centred card.
export function LoginSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted p-4 dark:bg-background">
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="flex items-center justify-center gap-3">
          <Skeleton className="size-12 rounded-xl" />
          <Skeleton className="h-7 w-32" />
        </div>
        <CardSkeleton lines={4} />
      </div>
    </div>
  )
}
