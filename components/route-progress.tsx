"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "cn"

// Thin bar at the top while the next page loads: starts on "rn:navigate"
// (instrumentation-client.ts), finishes when the URL has changed.
export function RouteProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timers = useRef<number[]>([])

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  // Start: jump to 20%, then creep towards 85% (never "done" before the page is).
  useEffect(() => {
    const start = () => {
      clear()
      setVisible(true)
      setProgress(20)
      ;[[150, 45], [600, 65], [1500, 78], [3500, 85]].forEach(([ms, p]) =>
        later(() => setProgress(p), ms)
      )
      later(() => setVisible(false), 15_000) // safety: never stuck on screen
    }
    window.addEventListener("rn:navigate", start)
    return () => {
      window.removeEventListener("rn:navigate", start)
      clear()
    }
  }, [])

  // URL changed = new page is showing: finish and fade out.
  useEffect(() => {
    if (!visible) return
    clear()
    setProgress(100)
    later(() => setVisible(false), 250)
    later(() => setProgress(0), 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px] shadow-primary/60 transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
