// Client-safe lists for the admin AI settings form (no secrets, no node APIs).
// "compat" = any OpenAI-compatible API (Groq, OpenRouter, DeepSeek, Ollama...).

export const AI_PROVIDERS = ["google", "openai", "anthropic", "compat"] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  google: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  compat: "OpenAI-compatible (Groq, OpenRouter...)",
}

// Env var each SDK reads when no key is saved in the admin page.
export const PROVIDER_ENV_KEYS: Record<AiProvider, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  compat: "COMPAT_API_KEY",
}

// Suggestions only: the form also accepts any custom model id.
export const PROVIDER_MODELS: Record<AiProvider, string[]> = {
  google: [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
  ],
  openai: ["gpt-5-mini", "gpt-5-nano", "gpt-5", "gpt-4.1-mini"],
  anthropic: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5-5"],
  compat: ["llama-3.3-70b-versatile", "deepseek-chat"],
}

export const DEFAULT_CHAT_MODEL = "google:gemini-3.5-flash-lite"
export const DEFAULT_EMBEDDING_MODEL = "google:gemini-embedding-001"

// "anthropic:claude-haiku-4-5" -> { provider: "anthropic", model: "claude-haiku-4-5" }
export function splitModelId(id: string): { provider: AiProvider; model: string } {
  const i = id.indexOf(":")
  const provider = id.slice(0, i) as AiProvider
  if (i > 0 && AI_PROVIDERS.includes(provider)) {
    return { provider, model: id.slice(i + 1) }
  }
  // Bare env ids, e.g. CHAT_MODEL=claude-haiku-4-5
  if (/^claude-/.test(id)) return { provider: "anthropic", model: id }
  if (/^(gpt-|o\d)/.test(id)) return { provider: "openai", model: id }
  return { provider: "google", model: id }
}
