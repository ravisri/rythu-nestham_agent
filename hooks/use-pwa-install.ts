"use client"

import { useSyncExternalStore } from "react"

// Chrome/Android "install app" event (not in the TS DOM types).
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

// Tiny module store: the event fires once, early, before any banner mounts.
let deferred: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
let started = false

// Called once from PwaRegister (app/layout.tsx).
export function startPwa() {
  if (started || typeof window === "undefined") return
  started = true
  installed = window.matchMedia("(display-mode: standalone)").matches

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault() // show our own button instead of the mini-infobar
    deferred = e as InstallEvent
    notify()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    installed = true
    notify()
  })

  // Production only: in dev a service worker would cache hot-reload files.
  if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const isIOS = () =>
  typeof navigator !== "undefined" &&
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !installed

export function usePwaInstall() {
  const canInstall = useSyncExternalStore(
    subscribe,
    () => !!deferred && !installed,
    () => false
  )
  const ios = useSyncExternalStore(subscribe, isIOS, () => false)

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    deferred = null
    notify()
  }

  return { canInstall, isIOS: ios, install }
}
