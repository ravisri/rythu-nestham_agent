"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Result = { 0: { transcript: string }; isFinal: boolean }
type RecognitionEvent = { results: ArrayLike<Result> }
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognitionCtor = new () => Recognition

function getCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function useSpeechRecognition(handlers: {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const latest = useRef(handlers)

  useEffect(() => {
    latest.current = handlers
  })
  useEffect(() => {
    setSupported(!!getCtor())
    return () => recognition.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = "te-IN"
    rec.interimResults = true
    rec.continuous = false

    rec.onresult = (e) => {
      const parts = Array.from(e.results)
      const text = parts.map((r) => r[0].transcript).join(" ").trim()
      if (parts[parts.length - 1]?.isFinal) latest.current.onFinal(text)
      else latest.current.onInterim(text)
    }
    rec.onerror = (e) => {
      setError(e.error)
      setListening(false)
    }
    rec.onend = () => setListening(false)

    setError(null)
    recognition.current = rec
    setListening(true)
    rec.start()
  }, [])

  const stop = useCallback(() => recognition.current?.stop(), [])

  return { supported, listening, error, start, stop }
}
