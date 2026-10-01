"use client"

import { useEffect, useState } from "react"
import type { Lexicon } from "@/lib/telugu-translit"

// Loaded once per page (browser caches the file); built by `npm run lexicon`.
let loading: Promise<Lexicon | null> | undefined

function loadLexicon(): Promise<Lexicon | null> {
  loading ??= fetch("/telugu-words.txt")
    .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
    .then((text) => new Map(text.split("\n").map((w, i) => [w.trim(), i])))
    .catch(() => {
      loading = undefined // retry next time; rules still work meanwhile
      return null
    })
  return loading
}

// Real Telugu words for typing suggestions; null until loaded (rules only).
export function useTeluguLexicon(enabled: boolean): Lexicon | null {
  const [lexicon, setLexicon] = useState<Lexicon | null>(null)
  useEffect(() => {
    if (!enabled || lexicon) return
    let active = true
    void loadLexicon().then((result) => {
      if (active && result) setLexicon(result)
    })
    return () => {
      active = false
    }
  }, [enabled, lexicon])
  return lexicon
}
