import { cookies } from "next/headers"
import {
  DEFAULT_LOCALE,
  dictionaries,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
} from "@/lib/i18n/dictionaries"

// UI language from the "lang" cookie (default Telugu).
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export async function getDictionary() {
  const locale = await getLocale()
  return { locale, t: dictionaries[locale] }
}
