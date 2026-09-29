import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"
import { chatModel, reasoningOptions } from "@/lib/ai"
import { BANNED_PROMPT_LIST } from "@/lib/banned-pesticides"
import { toCrop } from "@/lib/crops"
import { searchKnowledge } from "@/lib/rag"

export const maxDuration = 30

const SYSTEM_PROMPT = `You are Rythu Nestham, a crop advisor for farmers in Telangana and Andhra Pradesh.
Reply ONLY in simple, short Telugu (max 6 short sentences). It is read aloud.
Answer format: **సమస్య:** one sentence. **పరిష్కారం:** 2-3 "-" bullets. **జాగ్రత్త:** one sentence. (If you need more details, just ask one short question instead.)
1. Identify the crop and problem from the text or photo. If unclear, ask ONE short Telugu follow-up question instead of guessing.`

const SEARCH_RULE = `2. For a photo, if the reference below does not cover the problem you see, FIRST call queryCropKnowledgeBase with a short TELUGU query using Telugu crop and problem names (e.g. "వరి అగ్గి తెగులు నివారణ") and the English crop name, writing no text before the call.`

const REFERENCE_RULE = `2. For any disease, pest, nutrient, pesticide or dose question, use the reference text below (ANGRAU/ICAR guides).`

const ANSWER_RULES = `3. Answer from the reference / search text only. Prefer low-cost, locally available or organic options (neem oil, Trichoderma, pheromone traps, cultural practices); suggest a chemical only if needed, with the dose from the text. If nothing useful is there, give only general safe advice with no doses and tell the farmer to contact the local Rythu Bharosa Kendram / KVK.
4. Never suggest banned or dangerous pesticides (${BANNED_PROMPT_LIST}). Never invent doses.`

type Results = Awaited<ReturnType<typeof searchKnowledge>>["results"]

// Reference goes last so the fixed prompt prefix stays cacheable.
function systemPrompt(results: Results, canSearch: boolean): string {
  const reference = results.length
    ? results
        .map(
          (r, i) =>
            `[${i + 1}] (${[r.crop, r.topic].filter(Boolean).join("/")}${r.pages ? `, p. ${r.pages}` : ""}) ${r.text}`
        )
        .join("\n")
    : "none found"
  return [
    SYSTEM_PROMPT,
    canSearch ? SEARCH_RULE : REFERENCE_RULE,
    ANSWER_RULES,
    `Reference:\n${reference}`,
  ].join("\n")
}

const tools = {
  queryCropKnowledgeBase: tool({
    description:
      "Search ANGRAU/ICAR crop guides. Call before answering any crop disease, pest, nutrient, pesticide or dosage question.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Short Telugu query: crop + symptoms or pest (guides are in Telugu)"
        ),
      crop: z.string().optional().describe("English crop name if known"),
    }),
    execute: async ({ query, crop }) => searchKnowledge(query, toCrop(crop)),
  }),
}

// Keep the last 6 messages, and only the newest keeps images/tool output —
// older turns are reduced to their text to save input tokens.
function prune(messages: UIMessage[]): UIMessage[] {
  const recent = messages.slice(-6)
  const firstUser = recent.findIndex((m) => m.role === "user")
  const window = firstUser > 0 ? recent.slice(firstUser) : recent
  const last = window.length - 1

  return window
    .map((m, i) =>
      i === last ? m : { ...m, parts: m.parts.filter((p) => p.type === "text") }
    )
    .filter((m) => m.parts.length > 0)
}

function textOf(message: UIMessage): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim()
}

// Short follow-ups ("ఎంత మోతాదు?") get the previous question as context.
function searchQuery(window: UIMessage[], question: string): string {
  if (question.length >= 60) return question
  const previous = window
    .slice(0, -1)
    .findLast((m) => m.role === "user")
  return [previous && textOf(previous), question].filter(Boolean).join(" ")
}

function friendlyError(error: unknown): string {
  const text = String(error)
  if (/429|503|529|quota|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|rate|overloaded/i.test(text)) {
    return "ప్రస్తుతం చాలా మంది వాడుతున్నారు. కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి."
  }
  return "క్షమించండి, సమస్య వచ్చింది. దయచేసి మళ్లీ ప్రయత్నించండి."
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()
  const window = prune(messages)

  // Search before the LLM: one model call instead of two, and no reliance on
  // (free/small) models making a correct tool call. Photos keep the tool, since
  // the problem is only known after the model looks at the image.
  const last = window.at(-1)
  const question = last?.role === "user" ? textOf(last) : ""
  const hasImage = !!last?.parts.some((p) => p.type === "file")
  const { results } = question
    ? await searchKnowledge(searchQuery(window, question))
    : { results: [] }

  const model = chatModel()
  const result = streamText({
    model,
    system: systemPrompt(results, hasImage),
    messages: await convertToModelMessages(window, { tools }),
    tools: hasImage ? tools : undefined,
    stopWhen: stepCountIs(3),
    maxOutputTokens: 1500,
    // Text answers come from the reference; only photos need some thinking.
    providerOptions: reasoningOptions(model.modelId, hasImage ? "low" : "none"),
  })

  return result.toUIMessageStreamResponse({ onError: friendlyError })
}
