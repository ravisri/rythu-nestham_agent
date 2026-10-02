import type { Metadata, Viewport } from "next"
import { Geist_Mono, Noto_Sans_Telugu, Geist } from "next/font/google"

import "./globals.css"
import { PwaRegister } from "@/components/pwa/pwa-register"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/lib/i18n/client"
import { getLocale } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

// Applied via className on the body element (not the --font-sans token) so switching
// shadcn presets, which rewrite globals.css, can never break Telugu rendering.
const fontTelugu = Noto_Sans_Telugu({ subsets: ["telugu", "latin"] })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "రైతు నేస్తం",
  applicationName: "రైతు నేస్తం",
  // Installed on iPhone: full screen, app name and icon (PWA).
  appleWebApp: {
    capable: true,
    title: "రైతు నేస్తం",
    statusBarStyle: "default",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
  description:
    "పంట సమస్యలకు తెలుగులో సులభమైన, తక్కువ ఖర్చు పరిష్కారాలు — ANGRAU / ICAR సమాచారంతో.",
}

// Not token-driven: update with the palette when switching presets
// (also app/manifest.ts colors and app/icon.svg).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2f8f4e" },
    { media: "(prefers-color-scheme: dark)", color: "#16241b" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable
      )}
    >
      <body className={fontTelugu.className}>
        <PwaRegister />
        <ThemeProvider>
          <I18nProvider locale={locale}>
            <TooltipProvider>{children}</TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
