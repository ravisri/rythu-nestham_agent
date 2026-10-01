"use client"

import Link from "next/link"
import { BotIcon, LanguagesIcon, ShieldIcon, UserIcon } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n, useSwitchLocale } from "@/lib/i18n/client"

// Header avatar: farmers go straight to their profile (one tap);
// admins get a menu with the admin pages too.
export function ProfileMenu({
  username,
  isAdmin,
}: {
  username: string
  isAdmin: boolean
}) {
  const { t } = useI18n()
  const { switchLocale } = useSwitchLocale()
  const avatar = (
    <Avatar className="size-10">
      <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground uppercase">
        {username.charAt(0)}
      </AvatarFallback>
    </Avatar>
  )
  const buttonClass = "size-10 rounded-full p-0"

  if (!isAdmin) {
    return (
      <Button asChild variant="ghost" size="icon" className={buttonClass}>
        <Link href="/profile" aria-label={t.common.myProfile}>
          {avatar}
        </Link>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={buttonClass} aria-label={t.common.menu}>
          {avatar}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="truncate">{username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="h-11 text-base">
          <Link href="/profile">
            <UserIcon />
            {t.common.myProfile}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="h-11 text-base">
          <Link href="/admin">
            <ShieldIcon />
            {t.common.users}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="h-11 text-base">
          <Link href="/admin/ai">
            <BotIcon />
            {t.common.aiSettings}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="h-11 text-base"
          onSelect={switchLocale}
        >
          <LanguagesIcon />
          {t.common.switchTo}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
