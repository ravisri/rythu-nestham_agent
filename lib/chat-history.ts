// Chats live only in this browser (never in the DB), one key per user.
import type { UIMessage } from "ai"

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
