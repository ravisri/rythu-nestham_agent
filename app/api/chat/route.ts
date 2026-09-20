import { google } from "@ai-sdk/google"
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"
import { BANNED_PROMPT_LIST } from "@/lib/banned-pesticides"
import { searchKnowledge } from "@/lib/rag"

export const maxDuration = 30

const SYSTEM_PROMPT = `You are Rythu Nestham, a crop advisor for farmers in Telangana and Andhra Pradesh.
Reply ONLY in simple, short Telugu (max 6 short sentences). It is read aloud.
Answer format: **సమస్య:** one sentence. **పరిష్కారం:** 2-3 "-" bullets. **జాగ్రత్త:** one sentence. (If you need more details, just ask one short question instead.)
1. Identify the crop and problem from the text or photo. If unclear, ask ONE short Telugu follow-up question instead of guessing.
2. For any disease, pest, nutrient, pesticide or dose question, FIRST call queryCropKnowledgeBase with a short ENGLISH query (crop + symptoms/pest), writing no text before the call.
3. Answer from the returned text only. Prefer low-cost, locally available or organic options (neem oil, Trichoderma, pheromone traps, cultural practices); suggest a chemical only if needed, with the dose from the text. If nothing useful is returned, give only general safe advice with no doses and tell the farmer to contact the local Rythu Bharosa Kendram / KVK.
4. Never suggest banned or dangerous pesticides (${BANNED_PROMPT_LIST}). Never invent doses.`

const tools = {
  queryCropKnowledgeBase: tool({
    description:
      "Search ANGRAU/ICAR crop guides. Call before answering any crop disease, pest, nutrient, pesticide or dosage question.",
    inputSchema: z.object({
      query: z.string().describe("Short English query: crop + symptoms or pest"),
    }),
    execute: async ({ query }) => searchKnowledge(query),
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

function friendlyError(error: unknown): string {
  const text = String(error)
  if (/429|quota|RESOURCE_EXHAUSTED|rate/i.test(text)) {
    return "ప్రస్తుతం చాలా మంది వాడుతున్నారు. కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి."
  }
  return "క్షమించండి, సమస్య వచ్చింది. దయచేసి మళ్లీ ప్రయత్నించండి."
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(prune(messages), { tools }),
    tools,
    stopWhen: stepCountIs(3),
    maxOutputTokens: 1500,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 512 } } },
  })

  return result.toUIMessageStreamResponse({ onError: friendlyError })
}
