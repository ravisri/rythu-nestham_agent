"use client"

import { useCallback, useEffect, useRef, useState } from "react"

function toSpeakable(text: string): string[] {
  return text
    .replace(/[*_#`>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function useSpeechSynthesis() {
  const [supported, setSupported] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const voice = useRef<SpeechSynthesisVoice | undefined>(undefined)

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    setSupported(true)
    const pick = () => {
      voice.current = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.toLowerCase().startsWith("te"))
    }
    pick()
    window.speechSynthesis.addEventListener("voiceschanged", pick)
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pick)
      window.speechSynthesis.cancel()
    }
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeakingId(null)
  }, [])

  // One utterance per sentence: Chrome silently cuts off long utterances.
  const speak = useCallback((id: string, text: string) => {
    const synth = window.speechSynthesis
    synth.cancel()
    const sentences = toSpeakable(text)
    if (sentences.length === 0) return
    setSpeakingId(id)
    sentences.forEach((sentence, i) => {
      const u = new SpeechSynthesisUtterance(sentence)
      u.lang = "te-IN"
      u.rate = 0.9
      if (voice.current) u.voice = voice.current
      if (i === sentences.length - 1) {
        u.onend = () => setSpeakingId(null)
        u.onerror = () => setSpeakingId(null)
      }
      synth.speak(u)
    })
  }, [])

  return { supported, speakingId, speak, stop }
}
