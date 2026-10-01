import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText } from "ai"
import {
  AI_PROVIDERS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  type AiProvider,
} from "@/lib/ai-models"
import { getAiSettings, type AiSettings } from "@/lib/ai-settings"

// Models are "provider:model", e.g. anthropic:claude-haiku-4-5, openai:gpt-5-mini,
// compat:llama-3.3-70b-versatile (+ base URL). "compat" is any OpenAI-compatible
// API (Groq, OpenRouter, DeepSeek, Ollama...).
// Resolution order: admin page (/admin/ai, lib/ai-settings.ts) -> .env.local
// (CHAT_MODEL, OCR_MODEL, *_API_KEY, COMPAT_*) -> default. See .env.example.

type ProviderConfig = Pick<AiSettings, "apiKeys" | "compatBaseUrl">

// An undefined apiKey makes each SDK read its usual env var.
function provider(name: AiProvider, config: ProviderConfig) {
  const apiKey = config.apiKeys[name]
  switch (name) {
    case "google":
      return createGoogleGenerativeAI({ apiKey })
    case "openai":
      return createOpenAI({ apiKey })
    case "anthropic":
      return createAnthropic({ apiKey })
    case "compat":
      return createOpenAICompatible({
        name: "compat",
        baseURL: config.compatBaseUrl || required("COMPAT_BASE_URL"),
        apiKey: apiKey ?? process.env.COMPAT_API_KEY,
      })
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

// Bare model names: provider inferred from the official model id prefix.
function inferProvider(model: string): AiProvider {
  if (/^claude-/.test(model)) return "anthropic"
  if (/^(gpt-|o\d|text-embedding-)/.test(model)) return "openai"
  if (/^gemini-/.test(model)) return "google"
  throw new Error(
    `Unknown model "${model}". Use "provider:model", e.g. anthropic:claude-haiku-4-5`
  )
}

// "anthropic:claude-haiku-4-5" -> ["anthropic", "claude-haiku-4-5"]
function parse(id: string): [AiProvider, string] {
  const i = id.indexOf(":")
  const name = (i < 0 ? inferProvider(id) : id.slice(0, i)) as AiProvider
  if (!AI_PROVIDERS.includes(name)) {
    throw new Error(
      `Unknown provider "${name}" in "${id}". Use: ${AI_PROVIDERS.join(", ")}`
    )
  }
  return [name, i < 0 ? id : id.slice(i + 1)]
}

function languageModel(id: string, config: ProviderConfig) {
  const [name, model] = parse(id)
  return provider(name, config).languageModel(model)
}

// Effective model ids (admin setting -> env -> default).
export function modelIds(settings: AiSettings) {
  return {
    chat: settings.chatModel || process.env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
    ocr: settings.ocrModel || process.env.OCR_MODEL || DEFAULT_CHAT_MODEL,
    translate: process.env.TRANSLATE_MODEL || settings.ocrModel || DEFAULT_CHAT_MODEL,
    embedding: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
  }
}

export async function chatModel() {
  const settings = await getAiSettings()
  return languageModel(modelIds(settings).chat, settings)
}

// OCR needs PDF input: google, anthropic and openai support it.
export async function ocrModel() {
  const settings = await getAiSettings()
  return languageModel(modelIds(settings).ocr, settings)
}

// Ingest: translates non-Telugu documents to Telugu before embedding.
export async function translateModel() {
  const settings = await getAiSettings()
  return languageModel(modelIds(settings).translate, settings)
}

// The model stays env-only: changing it needs a full re-ingest, since stored
// vectors only match the model that made them. Its API key can come from /admin/ai.
export async function embeddingModel() {
  const settings = await getAiSettings()
  const [name, model] = parse(modelIds(settings).embedding)
  if (name === "anthropic") throw new Error("Anthropic has no embedding models")
  return provider(name, settings).embeddingModel(model)
}

// Admin "Test" button: one tiny call with the given (or saved/env) key.
export async function testModel(id: string, config: ProviderConfig) {
  await generateText({
    model: languageModel(id, config),
    prompt: "Reply with: ok",
    maxOutputTokens: 32,
    maxRetries: 0,
  })
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

// Keep reasoning cheap on every provider. Gemini 2.x takes a token budget;
// Gemini 3.x+ rejects thinkingBudget 0 and takes a thinkingLevel instead.
export function reasoningOptions(modelId: string, effort: "none" | "low") {
  const none = effort === "none"
  return {
    google: {
      thinkingConfig: /^gemini-2\./.test(modelId)
        ? { thinkingBudget: none ? 0 : 512 }
        : { thinkingLevel: none ? "minimal" : "low" },
    },
    openai: { reasoningEffort: none ? "minimal" : "low" },
  }
}
