"use client"

import { useEffect } from "react"
import { startPwa } from "@/hooks/use-pwa-install"

// Mounted once in app/layout.tsx: registers the service worker and catches the
// install event early (it fires before the chat screen mounts).
export function PwaRegister() {
  useEffect(startPwa, [])
  return null
}
