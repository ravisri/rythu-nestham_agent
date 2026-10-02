"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  BotIcon,
  CircleHelpIcon,
  LanguagesIcon,
  LogOutIcon,
  MoonIcon,
  ShieldIcon,
  SunIcon,
  TypeIcon,
  UserIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logout } from "@/app/login/actions"
import { useI18n, useSwitchLocale } from "@/lib/i18n/client"
import { HelpDialog } from "./help-dialog"

const ITEM = "h-11 text-base"

// Header avatar menu: profile, help, display settings, language, logout
// (admins also get the admin pages).
export function ProfileMenu({
  username,
  isAdmin,
  largeText,
  onToggleTextSize,
}: {
  username: string
  isAdmin: boolean
  largeText?: boolean
  onToggleTextSize?: () => void
}) {
  const { t } = useI18n()
  const { switchLocale } = useSwitchLocale()
  const { setTheme, resolvedTheme } = useTheme()
  const [helpOpen, setHelpOpen] = useState(false)
  const [loggingOut, startLogout] = useTransition()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 rounded-full p-0"
            aria-label={t.common.menu}
          >
            <Avatar className="size-10">
              <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground uppercase">
                {username.charAt(0)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="truncate">{username}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className={ITEM}>
            <Link href="/profile">
              <UserIcon />
              {t.common.myProfile}
            </Link>
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuItem asChild className={ITEM}>
                <Link href="/admin">
                  <ShieldIcon />
                  {t.common.users}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={ITEM}>
                <Link href="/admin/ai">
                  <BotIcon />
                  {t.common.aiSettings}
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className={ITEM} onSelect={() => setHelpOpen(true)}>
            <CircleHelpIcon />
            {t.help.open}
          </DropdownMenuItem>
          {onToggleTextSize && (
            <DropdownMenuCheckboxItem
              className={ITEM}
              checked={largeText}
              onCheckedChange={onToggleTextSize}
            >
              <TypeIcon />
              {t.chat.textSize}
            </DropdownMenuCheckboxItem>
          )}
          <DropdownMenuItem
            className={ITEM}
            onSelect={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            <SunIcon className="hidden dark:block" />
            <MoonIcon className="dark:hidden" />
            {t.chat.theme}
          </DropdownMenuItem>
          <DropdownMenuItem className={ITEM} onSelect={switchLocale}>
            <LanguagesIcon />
            {t.common.switchTo}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className={ITEM}
            disabled={loggingOut}
            onSelect={() => startLogout(() => logout())}
          >
            <LogOutIcon />
            {t.common.logout}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  )
}
