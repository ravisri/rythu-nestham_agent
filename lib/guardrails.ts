// Input guardrails, checked in the browser (instant alert) and again in
// /api/chat before any AI call or charge. Client-safe: no server imports.
import { MESSAGES } from "@/lib/plans"

export const MAX_QUESTION_CHARS = 600
const MAX_IMAGE_CHARS = 2_000_000 // data URL ~1.5 MB (the app sends ~100 KB)
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]

// Abuse / sexual words. Kept agriculture-safe on purpose: "kill pests",
// "sex pheromone traps", "చంపు" (kill) are normal farming words.
const ABUSE_TE = ["లంజ", "దెంగ", "పూకు", "మొడ్డ", "గుద్ద", "బోసిడి"]
const ABUSE_EN =
  /\b(fuck\w*|shit\w*|bitch\w*|bastard|porn\w*|nude|naked|xxx|rape\w*|lanja\w*|dengu\w*|puku|modda)\b/i

// Attempts to override the assistant's instructions.
const INJECTION =
  /(ignore|forget|disregard)\s+(all\s+|the\s+|your\s+)?(previous|above|prior|earlier)?\s*(instructions|rules|prompts?)|system\s*prompt|jail\s*break|developer\s+mode|you\s+are\s+now|pretend\s+to\s+be|act\s+as\s+(an?\s+)?(ai|chatgpt|gpt|assistant)|నియమాలు\s*మర్చిపో|సూచనలు\s*పట్టించుకోకు|ప్రాంప్ట్/i

// Telugu message for a wrong text, or null when it is fine.
export function checkText(text: string): string | null {
  const t = text.trim()
  if (t.length > MAX_QUESTION_CHARS) return MESSAGES.tooLong
  if (ABUSE_TE.some((w) => t.includes(w)) || ABUSE_EN.test(t)) {
    return MESSAGES.blockedText
  }
  if (INJECTION.test(t)) return MESSAGES.blockedText
  return null
}

type ImageInput = { mediaType?: string; url?: string }

// One crop photo, a real image data URL, not too large.
export function checkImages(files: ImageInput[]): string | null {
  if (files.length === 0) return null
  if (files.length > 1) return MESSAGES.badImage
  const [{ mediaType = "", url = "" }] = files
  const ok =
    IMAGE_TYPES.includes(mediaType) &&
    /^data:image\/(jpeg|png|webp);base64,/.test(url) &&
    url.length <= MAX_IMAGE_CHARS
  return ok ? null : MESSAGES.badImage
}

// Server replies that the chat shows as an alert (not as an answer).
export const GUARD_MESSAGES: string[] = [
  MESSAGES.blockedText,
  MESSAGES.tooLong,
  MESSAGES.badImage,
  MESSAGES.notAgri,
  MESSAGES.notAgriImage,
]
