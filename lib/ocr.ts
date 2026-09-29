// Google Cloud Vision OCR for scanned / legacy-font PDFs. Priced per page, not
// per token: far cheaper than LLM OCR for Telugu (whose output tokens dominate).
// Needs GOOGLE_VISION_API_KEY: a Google Cloud API key with "Cloud Vision API"
// enabled (billing account required; first 1,000 pages/month are free).

const ENDPOINT = "https://vision.googleapis.com/v1/files:annotate"
export const VISION_MAX_PAGES = 5 // sync files:annotate limit per request

type VisionResponse = {
  responses?: {
    responses?: { fullTextAnnotation?: { text?: string }; error?: { message: string } }[]
    error?: { message: string }
  }[]
  error?: { code: number; message: string }
}

export class VisionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message)
  }
}

// OCR every page of a small PDF (≤ VISION_MAX_PAGES pages); pages joined by newlines.
export async function visionOcr(pdf: Uint8Array, pageCount: number): Promise<string> {
  const key = process.env.GOOGLE_VISION_API_KEY
  if (!key) throw new VisionError("GOOGLE_VISION_API_KEY is not set", false)

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          inputConfig: {
            content: Buffer.from(pdf).toString("base64"),
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["te", "en"] },
          pages: Array.from({ length: pageCount }, (_, i) => i + 1),
        },
      ],
    }),
  })
  const body = (await res.json()) as VisionResponse
  if (!res.ok || body.error) {
    const message = body.error?.message ?? `Vision HTTP ${res.status}`
    throw new VisionError(message, res.status === 429 || res.status >= 500)
  }

  const file = body.responses?.[0]
  if (file?.error) throw new VisionError(file.error.message, false)
  return (file?.responses ?? [])
    .map((page) => {
      if (page.error) throw new VisionError(page.error.message, false)
      return page.fullTextAnnotation?.text ?? ""
    })
    .join("\n")
}

export const visionEnabled = () =>
  (process.env.OCR_ENGINE ??
    (process.env.GOOGLE_VISION_API_KEY ? "vision" : "llm")) === "vision"
