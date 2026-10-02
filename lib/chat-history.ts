// Chats live only in this browser (never in the DB), one key per user.
import type { UIMessage } from "ai"
import { istDay } from "@/lib/plans"

const key = (userId: string) => `rn_chat_${userId}`

export function loadChat(userId: string): UIMessage[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key(userId)) ?? "[]")
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

export function clearChat(userId: string) {
  try {
    localStorage.removeItem(key(userId))
  } catch {}
}

// Photos are large: keep them only in the newest messages.
function trim(messages: UIMessage[], max: number, keepImages: number) {
  const recent = messages.slice(-max)
  return recent.map((m, i) =>
    i >= recent.length - keepImages
      ? m
      : { ...m, parts: m.parts.filter((p) => p.type !== "file") }
  )
}

// Falls back to smaller copies when localStorage (~5 MB) is full.
export function saveChat(userId: string, messages: UIMessage[]) {
  for (const [max, keepImages] of [
    [50, 4],
    [20, 1],
    [10, 0],
  ]) {
    try {
      localStorage.setItem(
        key(userId),
        JSON.stringify(trim(messages, max, keepImages))
      )
      return
    } catch {}
  }
}

// Text questions answered today (IST): a repeat is not sent again (saves credits).
const askedKey = (userId: string) => `rn_asked_${userId}`
// "మిర్చి ఆకు ముడత?" and "మిర్చి  ఆకు ముడత" count as the same question.
const normalize = (question: string) =>
  question.toLowerCase().replace(/[\s\p{P}]+/gu, "")

function askedToday(userId: string): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(askedKey(userId)) ?? "{}")
    return saved.day === istDay() && Array.isArray(saved.questions)
      ? saved.questions
      : []
  } catch {
    return []
  }
}

export function wasAskedToday(userId: string, question: string) {
  const q = normalize(question)
  return q !== "" && askedToday(userId).includes(q)
}

export function markAsked(userId: string, question: string) {
  const q = normalize(question)
  if (!q) return
  const questions = [...new Set([...askedToday(userId), q])].slice(-100)
  try {
    localStorage.setItem(
      askedKey(userId),
      JSON.stringify({ day: istDay(), questions })
    )
  } catch {}
}
