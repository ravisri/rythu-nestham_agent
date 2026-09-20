// Usage: npm run ingest            (all files under data/pdfs/<crop>/*.pdf|txt|md)
// Needs in .env.local: GOOGLE_GENERATIVE_AI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { google } from "@ai-sdk/google"
import { generateText } from "ai"
import { extractText, getDocumentProxy } from "unpdf"
import { embedDocuments } from "@/lib/rag"
import { getSupabase } from "@/lib/supabase"

const ROOT = path.join(process.cwd(), "data", "pdfs")
const CHUNK_WORDS = 300
const OVERLAP_WORDS = 40
const BATCH = 50
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function chunk(text: string): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  const step = CHUNK_WORDS - OVERLAP_WORDS
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += step) {
    chunks.push(words.slice(i, i + CHUNK_WORDS).join(" "))
    if (i + CHUNK_WORDS >= words.length) break
  }
  return chunks
}

// Scanned PDFs / legacy Telugu fonts give empty or garbled text.
function looksGarbled(text: string, pages: number): boolean {
  if (text.trim().length < 200 * Math.max(pages, 1)) return true
  const letters = text.match(/[A-Za-zఀ-౿]/g)?.length ?? 0
  return letters / text.length < 0.5
}

async function readPdf(file: string): Promise<string> {
  const buffer = new Uint8Array(await readFile(file))
  const pdf = await getDocumentProxy(buffer.slice())
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  if (!looksGarbled(text, totalPages)) return text

  console.log("  text extraction poor, using Gemini OCR fallback")
  const { text: ocr } = await generateText({
    model: google("gemini-2.5-flash"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all text from this document faithfully. Keep Telugu as Telugu and English as English. Output plain text only.",
          },
          { type: "file", data: buffer, mediaType: "application/pdf" },
        ],
      },
    ],
  })
  return ocr
}

async function ingest(file: string, crop: string) {
  const source = path.basename(file)
  console.log(`Ingesting ${crop}/${source}`)
  const ext = path.extname(file).toLowerCase()
  const text = ext === ".pdf" ? await readPdf(file) : await readFile(file, "utf8")
  const chunks = chunk(text)
  if (chunks.length === 0) return console.log("  no text found, skipped")

  const supabase = getSupabase()
  await supabase.from("crop_knowledge").delete().eq("metadata->>source", source)

  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH)
    let embeddings: number[][] | undefined
    for (let attempt = 1; !embeddings; attempt++) {
      try {
        embeddings = await embedDocuments(batch)
      } catch (error) {
        if (attempt >= 4) throw error
        console.log(`  embed retry ${attempt} (rate limit?)`)
        await sleep(15_000 * attempt)
      }
    }
    const rows = batch.map((content, j) => ({
      content,
      metadata: { crop, source },
      embedding: embeddings[j],
    }))
    const { error } = await supabase.from("crop_knowledge").insert(rows)
    if (error) throw error
    await sleep(1500)
  }
  console.log(`  stored ${chunks.length} chunks`)
}

async function main() {
  const crops = await readdir(ROOT, { withFileTypes: true }).catch(() => [])
  if (crops.length === 0) {
    return console.log("Put files in data/pdfs/<crop>/, e.g. data/pdfs/paddy/guide.pdf")
  }
  for (const dir of crops.filter((d) => d.isDirectory())) {
    for (const f of await readdir(path.join(ROOT, dir.name))) {
      if (/\.(pdf|txt|md)$/i.test(f)) await ingest(path.join(ROOT, dir.name, f), dir.name)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
