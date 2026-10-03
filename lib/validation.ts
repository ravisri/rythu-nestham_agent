// Shared by the forms (react-hook-form) and re-checked in every Server Action.
import { z } from "zod"
import { AI_PROVIDERS } from "@/lib/ai-models"

// "+91 98765 43210" / "919876543210" -> "9876543210"
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "")
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits
}

export const isPhone = (value: string) =>
  /^[6-9]\d{9}$/.test(normalizePhone(value))

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9_]{3,20}$/,
    "3-20 ఆంగ్ల అక్షరాలు, అంకెలు లేదా _ మాత్రమే వాడండి"
  )

const optionalPhone = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine(
    (v) => v === "" || /^[6-9]\d{9}$/.test(v),
    "సరైన 10 అంకెల మొబైల్ నంబర్ ఇవ్వండి"
  )

const password = z
  .string()
  .min(6, "కనీసం 6 అక్షరాలు లేదా అంకెలు ఇవ్వండి")
  .max(64, "పాస్‌వర్డ్ చాలా పొడవుగా ఉంది")

const identifier = z
  .string()
  .trim()
  .min(1, "యూజర్‌నేమ్ లేదా ఫోన్ నంబర్ ఇవ్వండి")
  .max(40)

const samePasswords = (d: { password: string; confirm: string }) =>
  d.password === d.confirm
const mismatch = {
  path: ["confirm"],
  message: "రెండు పాస్‌వర్డ్‌లు ఒకటే ఉండాలి",
}

export const deviceIdSchema = z.string().max(100).optional()

export const loginSchema = z.object({
  identifier,
  password: z.string().min(1, "పాస్‌వర్డ్ ఇవ్వండి").max(64),
})

export const signupSchema = z
  .object({ username, phone: optionalPhone, password, confirm: z.string() })
  .refine(samePasswords, mismatch)

export const forgotSchema = z.object({ identifier })

export const resetSchema = z
  .object({
    identifier,
    recoveryCode: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{6}$/.test(v), "6 అంకెల రికవరీ కోడ్ ఇవ్వండి"),
    password,
    confirm: z.string(),
  })
  .refine(samePasswords, mismatch)

export const PLAN_IDS = ["trial", "pro", "pro_plus"] as const

export const adminCreateSchema = z.object({
  username,
  phone: optionalPhone,
  password,
  plan: z.enum(PLAN_IDS),
})

export const adminPlanSchema = z.object({
  userId: z.uuid(),
  plan: z.enum(PLAN_IDS),
  // yyyy-mm-dd; trial -> trial end date, pro plans -> plan expiry ("" = no expiry)
  expiresOn: z
    .string()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "సరైన తేదీ ఇవ్వండి"),
})

export const adminPasswordSchema = z.object({ userId: z.uuid(), password })

export const adminUserIdSchema = z.object({ userId: z.uuid() })

const aiProvider = z.enum(AI_PROVIDERS)
const modelName = z
  .string()
  .trim()
  .regex(/^[\w.\-/:@]{1,100}$/, "సరైన మోడల్ పేరు ఇవ్వండి")
const apiKey = z
  .string()
  .trim()
  .max(300, "కీ చాలా పొడవుగా ఉంది")
  .refine((v) => !/\s/.test(v), "కీలో ఖాళీలు ఉండకూడదు")
const baseUrl = z
  .string()
  .trim()
  .refine((v) => v === "" || z.url().safeParse(v).success, "సరైన URL ఇవ్వండి")

// API keys: "" = keep the saved key; providers in clearKeys lose their saved key.
export const aiSettingsSchema = z
  .object({
    chatProvider: aiProvider,
    chatModel: modelName,
    ocrProvider: aiProvider,
    ocrModel: modelName,
    guestProvider: aiProvider,
    guestModel: modelName,
    // "" = no daily guest token limit.
    guestDailyTokens: z
      .string()
      .trim()
      .regex(/^d{0,9}$/, "అంకెలు మాత్రమే ఇవ్వండి"),
    compatBaseUrl: baseUrl,
    apiKeys: z.object({
      google: apiKey,
      openai: apiKey,
      anthropic: apiKey,
      compat: apiKey,
    }),
    clearKeys: z.array(aiProvider),
  })
  .refine(
    (d) =>
      d.compatBaseUrl !== "" ||
      (d.chatProvider !== "compat" &&
        d.ocrProvider !== "compat" &&
        d.guestProvider !== "compat"),
    { path: ["compatBaseUrl"], message: "compat కోసం Base URL ఇవ్వండి" }
  )

export const aiTestSchema = z.object({
  provider: aiProvider,
  model: modelName,
  apiKey,
  compatBaseUrl: baseUrl,
})

export type LoginValues = z.input<typeof loginSchema>
export type SignupValues = z.input<typeof signupSchema>
export type ForgotValues = z.input<typeof forgotSchema>
export type ResetValues = z.input<typeof resetSchema>
export type AdminCreateValues = z.input<typeof adminCreateSchema>
export type AdminPlanValues = z.input<typeof adminPlanSchema>
export type AdminPasswordValues = z.input<typeof adminPasswordSchema>
export type AdminUserIdValues = z.input<typeof adminUserIdSchema>
export type AiSettingsValues = z.input<typeof aiSettingsSchema>
export type AiTestValues = z.input<typeof aiTestSchema>
