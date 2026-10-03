import Link from "next/link"
import { TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import type { ModelUsageRow } from "@/lib/token-usage"

const time = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""

// Models that hit quota / rate limits today: tells the admin to switch models.
export function QuotaAlert({
  alerts,
  t,
  showLink = true,
}: {
  alerts: ModelUsageRow[]
  t: Dictionary
  showLink?: boolean
}) {
  if (alerts.length === 0) return null
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>{t.usage.quotaTitle}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <ul className="list-disc pl-4">
          {alerts.map((a) => (
            <li key={`${a.model}-${a.audience}`}>
              <span className="font-mono">{a.model}</span> (
              {t.usage.audience[a.audience]}) —{" "}
              {t.usage.quotaLine(a.quota_errors, time(a.last_error_at))}
            </li>
          ))}
        </ul>
        <span>{t.usage.quotaHint}</span>
        {showLink && (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link href="/admin/ai">{t.common.aiSettings}</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
