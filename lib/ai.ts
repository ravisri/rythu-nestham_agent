import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

// Switch models from .env.local with "provider:model", e.g.
//   CHAT_MODEL=anthropic:claude-haiku-4-5   CHAT_MODEL=openai:gpt-5-mini
//   CHAT_MODEL=compat:llama-3.3-70b-versatile + COMPAT_BASE_URL/COMPAT_API_KEY
// "compat" is any OpenAI-compatible API (Groq, OpenRouter, DeepSeek, Ollama...).
// See .env.example.

const providers = {
  google,
  openai,
  anthropic,
  compat: () =>
    createOpenAICompatible({
      name: "compat",
      baseURL: required("COMPAT_BASE_URL"),
      apiKey: process.env.COMPAT_API_KEY,
    }),
}

type ProviderName = keyof typeof providers

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

// Bare model names: provider inferred from the official model id prefix.
function inferProvider(model: string): ProviderName {
  if (/^claude-/.test(model)) return "anthropic"
  if (/^(gpt-|o\d|text-embedding-)/.test(model)) return "openai"
  if (/^gemini-/.test(model)) return "google"
  throw new Error(
    `Unknown model "${model}". Use "provider:model", e.g. anthropic:claude-haiku-4-5`
  )
}

// "anthropic:claude-haiku-4-5" -> ["anthropic", "claude-haiku-4-5"]
function parse(id: string): [ProviderName, string] {
  const i = id.indexOf(":")
  const name = (i < 0 ? inferProvider(id) : id.slice(0, i)) as ProviderName
  if (!(name in providers)) {
    throw new Error(
      `Unknown provider "${name}" in "${id}". Use: ${Object.keys(providers).join(", ")}`
    )
  }
  return [name, i < 0 ? id : id.slice(i + 1)]
}

function languageModel(id: string) {
  const [name, model] = parse(id)
  return name === "compat" ? providers.compat()(model) : providers[name](model)
}

export const chatModel = () =>
  languageModel(process.env.CHAT_MODEL || "google:gemini-2.5-flash")

// OCR needs PDF input: google, anthropic and openai support it.
export const ocrModel = () =>
  languageModel(process.env.OCR_MODEL || "google:gemini-2.5-flash")

// Changing this needs a full re-ingest: stored vectors only match the model that made them.
export function embeddingModel() {
  const [name, model] = parse(
    process.env.EMBEDDING_MODEL || "google:gemini-embedding-001"
  )
  if (name === "anthropic") throw new Error("Anthropic has no embedding models")
  return name === "compat"
    ? providers.compat().embeddingModel(model)
    : providers[name].embeddingModel(model)
}

// 768 must match vector(768) in supabase/migrations/0001_init_pgvector.sql
export const EMBED_DIMS = 768

// Options are keyed by provider, so each provider only reads its own.
export const embedOptions = (
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT"
) => ({
  google: { outputDimensionality: EMBED_DIMS, taskType },
  openai: { dimensions: EMBED_DIMS },
  compat: { dimensions: EMBED_DIMS },
})

// Keep reasoning cheap on every provider (0 = off where supported).
export const reasoningOptions = (budget: number) => ({
  google: { thinkingConfig: { thinkingBudget: budget } },
  openai: { reasoningEffort: budget === 0 ? "minimal" : "low" },
})
