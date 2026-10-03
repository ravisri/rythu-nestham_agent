import {
  APICallError,
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
import { checkImages, checkText } from "@/lib/guardrails"
import { answerModel, byokAnswerModel, reasoningOptions } from "@/lib/ai"
import { chargeByok, getUserGoogleKey, refundByok } from "@/lib/user-keys"
import { isQuotaError } from "@/lib/token-usage"
import { getAiSettings } from "@/lib/ai-settings"
import {
  getCurrentUser,
  getGuestId,
  hasSessionCookie,
  ipKey,
  renewSession,
  type AppUser,
} from "@/lib/auth"
import {
  addGuestSuggestion,
  chargeGuest,
  guestLeft,
  guestSuggestionsLeft,
  refundGuest,
} from "@/lib/guest"
import { creditCost, MESSAGES, planStatus } from "@/lib/plans"
import {
  addUserSuggestion,
  chargeCredits,
  chargePhoto,
  recordUsage,
  refundPhoto,
  usageSummary,
  userSuggestionsLeft,
} from "@/lib/usage"
import { NEXT_MARKER, stripSuggestions } from "@/lib/suggestions"
import { BANNED_PROMPT_LIST } from "@/lib/banned-pesticides"
import { cropFromText, toCrop } from "@/lib/crops"
import { searchKnowledge } from "@/lib/rag"
import {
  guestTokensToday,
  recordGuestTokens,
  recordModelUsage,
} from "@/lib/token-usage"

export const maxDuration = 30

const SYSTEM_PROMPT = `You are Rythu Nestham, a crop advisor for farmers in Telangana and Andhra Pradesh.
Reply ONLY in simple Telugu with short sentences. It is read aloud.
Answer format (each label on its own line, each bullet on a new line):
**సమస్య:** 1-2 sentences; name every likely cause the reference mentions.
**పరిష్కారం:**
**సేంద్రీయ / తక్కువ ఖర్చు:**
- bullets
**జీవ నియంత్రణ:**
- bullets (Trichoderma, Pseudomonas, NPV, parasitoids, ...)
**సాగు పద్ధతులు:**
- bullets
**రసాయన (అవసరమైతే మాత్రమే):**
- bullets, each with the dose from the reference
**జాగ్రత్త:** one sentence.
Read ALL reference items and list EVERY distinct solution they give (each method/product once, merge duplicates), so the farmer sees all options. Skip a group with nothing in the reference. One short line per bullet, at most 4 bullets per group.
Use only products and doses from the reference for this crop; never mix in advice meant for a different crop.
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
// Added only while the user has suggestions left today (lib/plans.ts limits).
const SUGGEST_RULE = `After a real answer (not a fixed reply above), add ONE last line exactly:
${NEXT_MARKER} <question 1> || <question 2>
Two short Telugu follow-up questions (max 12 words each) this farmer may ask next about the same crop/problem, answerable from ANGRAU/ICAR guides.`

function systemPrompt(
  results: Results,
  canSearch: boolean,
  suggest: boolean
): string {
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
    ...(suggest ? [SUGGEST_RULE] : []),
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
    .map((m, i) => ({
      ...m,
      parts: (i === last
        ? m.parts
        : m.parts.filter((p) => p.type === "text")
      ).map((p) =>
        p.type === "text" && m.role === "assistant"
          ? { ...p, text: stripSuggestions(p.text) }
          : p
      ),
    }))
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
  const previous = window.slice(0, -1).findLast((m) => m.role === "user")
  return [previous && textOf(previous), question].filter(Boolean).join(" ")
}

// Errors on the user's own key: tell them what to fix (no fallback to ours).
function ownKeyError(error: unknown): string {
  if (isQuotaError(error)) return MESSAGES.byokQuota
  const status = APICallError.isInstance(error) ? error.statusCode : undefined
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    /api.?key/i.test(String(error))
  ) {
    return MESSAGES.byokInvalid
  }
  return friendlyError(error)
}

function friendlyError(error: unknown): string {
  const text = String(error)
  if (
    /429|503|529|quota|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|rate|overloaded/i.test(
      text
    )
  ) {
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

const NO_ANSWER = [
  MESSAGES.notAvailable,
  MESSAGES.notAgri,
  MESSAGES.notAgriImage,
]

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

// Charging differs for users (credits + plan photo limit) and guests (free
// daily questions); everything else in POST is the same for both.
type Meter = {
  left: () => Promise<number>
  // null = charged; otherwise the limit reply to return.
  charge: (hasImage: boolean) => Promise<Response | null>
  // After the answer: refund a non-answer, record tokens.
  settle: (
    noAnswer: boolean,
    tokensIn: number,
    tokensOut: number
  ) => Promise<void>
  // The model failed: give everything back.
  refund: () => Promise<void>
  // "Next question" suggestions left today / count one that was shown.
  suggestionsLeft: () => Promise<number>
  addSuggestion: () => Promise<void>
  // Set after charge() when this question runs on the user's own Google key.
  ownKey?: () => string | undefined
}

function userMeter(user: AppUser): Meter {
  let cost = 0
  let photo = false
  let ownKey: string | undefined // app quota used up: the user's own key

  // App quota used up: continue on the user's own Google key (no credits).
  async function useOwnKey(limitReply: Response): Promise<Response | null> {
    const key = await getUserGoogleKey(user.id)
    if (!key) return limitReply
    if (!(await chargeByok(user.id))) return reply(429, MESSAGES.byokLimit)
    ownKey = key
    cost = 0
    photo = false
    return null
  }

  return {
    left: async () => (await usageSummary(user)).left,
    charge: async (hasImage) => {
      // Photos cost the most tokens: limited per plan per day.
      if (hasImage && !(await chargePhoto(user))) {
        return useOwnKey(reply(429, MESSAGES.photoLimit))
      }
      photo = hasImage
      cost = creditCost(hasImage)
      const charged = await chargeCredits(user, cost)
      if (charged === "ok") return null
      if (photo) await refundPhoto(user.id)
      const trial = user.plan === "trial" && charged === "period"
      return useOwnKey(
        reply(429, trial ? MESSAGES.trialLimit : LIMIT_MESSAGE[charged])
      )
    },
    settle: async (noAnswer, tokensIn, tokensOut) => {
      if (noAnswer && ownKey) await refundByok(user.id)
      if (noAnswer && photo) await refundPhoto(user.id)
      await recordUsage(user.id, noAnswer ? -cost : 0, tokensIn, tokensOut)
    },
    refund: async () => {
      if (ownKey) return refundByok(user.id)
      if (photo) await refundPhoto(user.id)
      await recordUsage(user.id, -cost)
    },
    ownKey: () => ownKey,
    suggestionsLeft: () => userSuggestionsLeft(user),
    addSuggestion: () => addUserSuggestion(user.id),
  }
}

function guestMeter(guestId: string, ip: string): Meter {
  let photo = false
  return {
    left: () => guestLeft(guestId),
    charge: async (hasImage) => {
      const charged = await chargeGuest(guestId, ip, hasImage)
      if (charged === "ok") {
        photo = hasImage
        return null
      }
      return reply(
        429,
        charged === "photo" ? MESSAGES.guestPhotoLimit : MESSAGES.guestLimit
      )
    },
    settle: async (noAnswer, tokensIn, tokensOut) => {
      await recordGuestTokens(guestId, tokensIn, tokensOut)
      if (noAnswer) await refundGuest(guestId, ip, photo)
    },
    refund: () => refundGuest(guestId, ip, photo),
    suggestionsLeft: () => guestSuggestionsLeft(guestId),
    addSuggestion: () => addGuestSuggestion(guestId),
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  let meter: Meter
  if (user) {
    const status = planStatus(user)
    if (status !== "active") {
      return reply(
        403,
        status === "trial_over" ? MESSAGES.trialOver : MESSAGES.expired
      )
    }
    meter = userMeter(user)
  } else {
    // Signed in on another phone: not a guest, back to login (as before).
    if (await hasSessionCookie()) return reply(401, MESSAGES.sessionEnded)
    // Admin's optional daily token budget for all guests (free model quota).
    const budget = (await getAiSettings()).guestDailyTokens
    if (budget && (await guestTokensToday()) >= budget) {
      return reply(429, MESSAGES.guestLimit)
    }
    meter = guestMeter((await getGuestId(true))!, ipKey(req))
  }
  const audience = user ? "user" : "guest"

  const { messages }: { messages: UIMessage[] } = await req.json()
  const window = prune(messages)

  // Search before the LLM: one model call instead of two, and no reliance on
  // (free/small) models making a correct tool call. Photos keep the tool, since
  // the problem is only known after the model looks at the image.
  const last = window.at(-1)
  if (last?.role !== "user") return reply(400, friendlyError(""))
  const question = textOf(last)
  const hasImage = last.parts.some((p) => p.type === "file")

  // Guardrails: abusive / injection / too-long text and bad uploads are
  // refused before any search, charge or model call (shown as an alert).
  const blocked =
    checkText(question) ??
    checkImages(last.parts.flatMap((p) => (p.type === "file" ? [p] : [])))
  if (blocked) return reply(422, blocked)

  if (user) await renewSession()

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
    return reply(422, MESSAGES.notAgri) // alert, no credit
  }
  const search = query
    ? await searchKnowledge(query, hasImage ? undefined : cropFromText(query))
    : { results: [], unavailable: false }
  const { results } = search
  if (!hasImage && results.length === 0 && !search.unavailable) {
    return quickReply(MESSAGES.notAvailable, await meter.left())
  }

  const limited = await meter.charge(hasImage)
  if (limited) return limited
  const [left, suggestionsLeft] = await Promise.all([
    meter.left(),
    meter.suggestionsLeft(),
  ])

  // Guests use the admin's (free) guest model; users the chat model.
  // Own key: the admin's Gemini model on the user's key (never our key).
  const ownKey = meter.ownKey?.()
  const { id: baseId, model } = ownKey
    ? await byokAnswerModel(ownKey)
    : await answerModel(!user)
  const modelId = ownKey ? `byok:${baseId}` : baseId
  const result = streamText({
    model,
    system: systemPrompt(results, hasImage, suggestionsLeft > 0),
    messages: await convertToModelMessages(window, { tools }),
    tools: hasImage ? tools : undefined,
    stopWhen: stepCountIs(3),
    maxOutputTokens: 2000, // complete answers (all solution groups) aren't cut off
    // Text answers come from the reference; only photos need some thinking.
    // Photos: fixed medium resolution (~258 tokens) instead of tiling (Gemini only).
    providerOptions: withMediaResolution(
      reasoningOptions(model.modelId, hasImage ? "low" : "none"),
      hasImage
    ),
    // "Not available" / "ask about farming" / not a farm photo is not a real answer: refund it.
    onFinish: async ({ text, totalUsage }) => {
      const tokensIn = totalUsage.inputTokens ?? 0
      const tokensOut = totalUsage.outputTokens ?? 0
      await Promise.all([
        meter.settle(
          NO_ANSWER.some((m) => text.includes(m)),
          tokensIn,
          tokensOut
        ),
        recordModelUsage({ model: modelId, audience, tokensIn, tokensOut }),
        // Count suggestions only when the model actually gave them.
        text.includes(NEXT_MARKER) ? meter.addSuggestion() : undefined,
      ])
    },
    // The farmer got no answer: give the credits (and photo) back. Quota
    // errors show up as an alert on /admin/usage so the admin can switch models.
    onError: async ({ error }) => {
      await Promise.all([
        meter.refund(),
        recordModelUsage({ model: modelId, audience, error }),
      ])
    },
  })

  return result.toUIMessageStreamResponse({
    onError: (error) => (ownKey ? ownKeyError(error) : friendlyError(error)),
    // Credits left (header badge) + sources of the pre-searched reference.
    messageMetadata: ({ part }) =>
      part.type === "start"
        ? {
            left,
            sources: results.map(({ source, pages }) => ({ source, pages })),
          }
        : undefined,
  })
}
