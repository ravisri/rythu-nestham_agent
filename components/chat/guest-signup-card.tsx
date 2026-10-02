"use client"

import Link from "next/link"
import {
  CameraIcon,
  CheckIcon,
  GraduationCapIcon,
  LogInIcon,
  MessageSquarePlusIcon,
  SproutIcon,
  UserPlusIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n/client"

const BENEFIT_ICONS: LucideIcon[] = [
  MessageSquarePlusIcon,
  CameraIcon,
  WalletIcon,
  GraduationCapIcon,
]

// Shown to guests when today's free questions are used up.
export function GuestSignupCard() {
  const { t } = useI18n()
  return (
    <Card className="mx-auto w-full max-w-5xl overflow-hidden border-primary/30 pt-0 shadow-md">
      <div className="flex items-center gap-3 bg-linear-to-r from-primary/20 via-primary/10 to-transparent px-4 py-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <SproutIcon className="size-7" />
        </span>
        <div className="min-w-0">
          <p className="text-lg leading-tight font-bold">{t.guest.cardTitle}</p>
          <p className="text-sm text-muted-foreground">{t.guest.cardBody}</p>
        </div>
      </div>
      <CardContent className="flex flex-col gap-4 px-4">
        <ul className="grid gap-2 sm:grid-cols-2">
          {t.guest.benefits.map((benefit, i) => {
            const Icon = BENEFIT_ICONS[i] ?? CheckIcon
            return (
              <li key={benefit} className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="text-base">{benefit}</span>
              </li>
            )
          })}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild className="h-12 text-base">
            <Link href="/login?tab=signup">
              <UserPlusIcon />
              {t.guest.signup}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-12 text-base">
            <Link href="/login">
              <LogInIcon />
              {t.guest.login}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
