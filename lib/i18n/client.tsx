"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import {
  DEFAULT_LOCALE,
  dictionaries,
  LOCALE_COOKIE,
  translateMessage,
  type Locale,
} from "@/lib/i18n/dictionaries"

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: ReactNode
}) {
  return <LocaleContext value={locale}>{children}</LocaleContext>
}

// t = static UI text; tr = translate a Telugu error/validation message.
export function useI18n() {
  const locale = useContext(LocaleContext)
  return {
    locale,
    t: dictionaries[locale],
    tr: (message: string) => translateMessage(message, locale),
  }
}

// Full reload, not router.refresh(): in Next 16.3 / React 19.2 dev, a refresh
// that re-renders the root layout crashes the RSC stream ("enqueueModel" of
// null). Switching is rare and chat history lives in localStorage.
export function useSwitchLocale() {
  const locale = useContext(LocaleContext)
  const [pending, setPending] = useState(false)

  const switchLocale = () => {
    const next: Locale = locale === "te" ? "en" : "te"
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    setPending(true)
    window.location.reload()
  }

  return { switchLocale, pending }
}
