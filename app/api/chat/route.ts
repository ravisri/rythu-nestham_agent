import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"
import { isImproper, looksAgricultural } from "@/lib/agri-topic"
import { chatModel, reasoningOptions } from "@/lib/ai"
import { getCurrentUser, renewSession } from "@/lib/auth"
import { creditCost, MESSAGES, planStatus } from "@/lib/plans"
import {
  chargeCredits,
  chargePhoto,
  recordUsage,
  refundPhoto,
  usageSummary,
} from "@/lib/usage"
import { BANNED_PROMPT_LIST } from "@/lib/banned-pesticides"
import { toCrop } from "@/lib/crops"
import { searchKnowledge } from "@/lib/rag"

export const maxDuration = 30

const SYSTEM_PROMPT = `You are Rythu Nestham, a crop advisor for farmers in Telangana and Andhra Pradesh.
Reply ONLY in simple Telugu with short sentences. It is read aloud.
Answer format (each label on its own line, each bullet on a new line):
**సమస్య:** 1-2 sentences; name every likely cause the reference mentions.
**పరిష్కారం:**
**సేంద్రీయ / తక్కువ ఖర్చు:**
- 1-2 bullets
**సాగు పద్ధతులు:**
- 1-2 bullets
**రసాయన (అవసరమైతే మాత్రమే):**
- 1-2 bullets, each with the dose from the reference
**జాగ్రత్త:** one sentence.
Combine useful points from ALL reference items, not just the first. Include only the groups the reference supports (skip a group if it has nothing); max 7 bullets in total.
(If you need more details, just ask one short question instead.)
1. Identify the crop and problem from the text or photo. If unclear, ask ONE short Telugu follow-up question instead of guessing.`

const SEARCH_RULE = `2. Photo: first check it. If it does not show crops, plants, leaves, fruits, seeds, soil, pests, farm animals or fields, reply exactly: "${MESSAGES.notAgriImage}" and nothing else (no search).
For a farm photo, if the reference below does not cover the problem you see, FIRST call queryCropKnowledgeBase with a short TELUGU query using Telugu crop and problem names (e.g. "వరి అగ్గి తెగులు నివారణ") and the English crop name, writing no text before the call.`

const REFERENCE_RULE = `2. For any disease, pest, nutrient, pesticide or dose question, use the reference text below (ANGRAU/ICAR guides).`

const ANSWER_RULES = `3. Answer from the reference / search text only. Prefer low-cost, locally available or organic options (neem oil, Trichoderma, pheromone traps, cultural practices); suggest a chemical only if needed, with the dose from the text. If nothing relevant is there (after any search), reply exactly: "${MESSAGES.notAvailable}"
4. If the question is not about farming, crops, livestock or rural farm life, reply exactly: "${MESSAGES.notAgri}"
5. Never suggest banned or dangerous pesticides (${BANNED_PROMPT_LIST}). Never invent doses.`

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

// Plain-text Telugu error: the chat UI shows (and can read aloud) the body.
const reply = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })

// A fixed Telugu answer shown as a normal chat reply (no model call).
function quickReply(text: string, left: number) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageMetadata: { left } })
      writer.write({ type: "text-start", id: "quick" })
      writer.write({ type: "text-delta", id: "quick", delta: text })
      writer.write({ type: "text-end", id: "quick" })
      writer.write({ type: "finish" })
    },
  })
  return createUIMessageStreamResponse({ stream })
}

const NO_ANSWER = [MESSAGES.notAvailable, MESSAGES.notAgri, MESSAGES.notAgriImage]

function withMediaResolution(
  options: ReturnType<typeof reasoningOptions>,
  hasImage: boolean
) {
  if (!hasImage) return options
  return {
    ...options,
    google: { ...options.google, mediaResolution: "MEDIA_RESOLUTION_MEDIUM" },
  }
}

const LIMIT_MESSAGE = {
  daily: MESSAGES.dailyLimit,
  period: MESSAGES.periodLimit,
} as const

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return reply(401, MESSAGES.sessionEnded)

  const status = planStatus(user)
  if (status !== "active") {
    return reply(403, status === "trial_over" ? MESSAGES.trialOver : MESSAGES.expired)
  }

  const { messages }: { messages: UIMessage[] } = await req.json()
  const window = prune(messages)

  // Search before the LLM: one model call instead of two, and no reliance on
  // (free/small) models making a correct tool call. Photos keep the tool, since
  // the problem is only known after the model looks at the image.
  const last = window.at(-1)
  if (last?.role !== "user") return reply(400, friendlyError(""))
  const question = textOf(last)
  const hasImage = last.parts.some((p) => p.type === "file")

  await renewSession()

  // Photos cost the most tokens: limited per plan per day (checked first).
  if (hasImage && !(await chargePhoto(user))) {
    return reply(429, MESSAGES.photoLimit)
  }

  // Off-topic / improper text questions and questions we have no data for are
  // answered here: no LLM call and no credit used. Photos always go to the LLM.
  // (Embedding similarity alone can't spot off-topic Telugu, so check words first.)
  // Photo with only the generic "look at this photo" text: skip the pre-search
  // (its chunks would be irrelevant tokens); the model searches for what it sees.
  const query =
    question && (!hasImage || looksAgricultural(question))
      ? searchQuery(window, question)
      : ""
  if (!hasImage && (isImproper(question) || !looksAgricultural(query))) {
    return quickReply(MESSAGES.notAgri, (await usageSummary(user)).left)
  }
  const search = query
    ? await searchKnowledge(query)
    : { results: [], unavailable: false }
  const { results } = search
  if (!hasImage && results.length === 0 && !search.unavailable) {
    return quickReply(MESSAGES.notAvailable, (await usageSummary(user)).left)
  }

  const cost = creditCost(hasImage)
  const charged = await chargeCredits(user, cost)
  if (charged !== "ok") {
    if (hasImage) await refundPhoto(user.id)
    const trial = user.plan === "trial" && charged === "period"
    return reply(429, trial ? MESSAGES.trialLimit : LIMIT_MESSAGE[charged])
  }
  const usage = await usageSummary(user)

  const model = await chatModel()
  const result = streamText({
    model,
    system: systemPrompt(results, hasImage),
    messages: await convertToModelMessages(window, { tools }),
    tools: hasImage ? tools : undefined,
    stopWhen: stepCountIs(3),
    maxOutputTokens: 1500,
    // Text answers come from the reference; only photos need some thinking.
    // Photos: fixed medium resolution (~258 tokens) instead of tiling (Gemini only).
    providerOptions: withMediaResolution(
      reasoningOptions(model.modelId, hasImage ? "low" : "none"),
      hasImage
    ),
    onFinish: async ({ text, totalUsage }) => {
      // "Not available" / "ask about farming" / not a farm photo is not a real answer: refund it.
      const noAnswer = NO_ANSWER.some((m) => text.includes(m))
      if (noAnswer && hasImage) await refundPhoto(user.id)
      await recordUsage(
        user.id,
        noAnswer ? -cost : 0,
        totalUsage.inputTokens ?? 0,
        totalUsage.outputTokens ?? 0
      )
    },
    // The farmer got no answer: give the credits (and photo) back.
    onError: async () => {
      if (hasImage) await refundPhoto(user.id)
      await recordUsage(user.id, -cost)
    },
  })

  return result.toUIMessageStreamResponse({
    onError: friendlyError,
    // Credits left (header badge) + sources of the pre-searched reference.
    messageMetadata: ({ part }) =>
      part.type === "start"
        ? {
            left: usage.left,
            sources: results.map(({ source, pages }) => ({ source, pages })),
          }
        : undefined,
  })
}
