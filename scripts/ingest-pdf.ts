// Usage: npm run ingest                  (all files under data/pdfs/<crop>/*.pdf|txt|md)
//        npm run ingest -- --crop paddy  (only paddy sections / folders)
// Needs in .env.local: GOOGLE_GENERATIVE_AI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional: OCR_MODEL (default gemini-2.5-flash).
// Optional manifest "<pdf name>.json" next to a PDF:
//   { "pages": "120-175" }  limits OCR to those PDF pages, or
//   { "source", "state", "pageOffset", "sections": [{ crop, topic, title, pages | pdfPages, skip? }] }
//   splits a multi-crop book; "pages" are printed page numbers (PDF page = printed + pageOffset).
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { google } from "@ai-sdk/google"
import { generateText } from "ai"
import { PDFDocument } from "pdf-lib"
import { extractText, getDocumentProxy } from "unpdf"
import { CROPS, isCrop } from "@/lib/crops"
import { embedDocuments } from "@/lib/rag"
import { getSupabase } from "@/lib/supabase"

const ROOT = path.join(process.cwd(), "data", "pdfs")
const OCR_CACHE = path.join(process.cwd(), "data", "ocr")
const OCR_MODEL = process.env.OCR_MODEL || "gemini-2.5-flash"
const OCR_PAGES_PER_CALL = 5
const CHUNK_WORDS = 120 // ~800 Telugu chars; must fit MAX_CHARS in lib/rag.ts
const OVERLAP_WORDS = 20
// Free-tier gemini-embedding-001 allows ~30k tokens/min; 10 Telugu chunks ≈ 8k tokens.
const BATCH = 10
const EMBED_PAUSE_MS = 20_000
const ONLY_CROP = process.argv.includes("--crop")
  ? process.argv[process.argv.indexOf("--crop") + 1]
  : undefined
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Section = {
  crop: string
  topic?: string
  title?: string
  pages?: string
  pdfPages?: string
  skip?: boolean
}
type Manifest = {
  source?: string
  state?: string
  pageOffset?: number
  pages?: string
  sections?: Section[]
}
// One unit of work: a set of PDF pages that all belong to one crop/topic.
type Job = {
  crop: string
  topic?: string
  section?: string
  pdfPages?: number[] // undefined = whole document
  offset: number // subtracted from PDF page numbers for citations
}

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

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= 5) throw error
      const reason = String((error as Error)?.message ?? error).slice(0, 120)
      console.log(`  ${label} retry ${attempt}: ${reason}`)
      await sleep(30_000 * attempt) // rate limits reset per minute
    }
  }
}

// Scanned PDFs / legacy Telugu fonts give empty or garbled text.
function looksGarbled(text: string, pages: number): boolean {
  if (text.trim().length < 200 * Math.max(pages, 1)) return true
  const letters = text.match(/[A-Za-zఀ-౿]/g)?.length ?? 0
  return letters / text.length < 0.5
}

// "120-175" or "1-10,40-60" -> sorted page numbers (shifted by offset).
function parsePages(spec: string, offset = 0): number[] {
  const pages = new Set<number>()
  for (const part of spec.split(",")) {
    const [a, b = a] = part.split("-").map((n) => parseInt(n.trim(), 10))
    for (let p = a; p <= b; p++) pages.add(p + offset)
  }
  return [...pages].sort((x, y) => x - y)
}

async function readManifest(file: string): Promise<Manifest> {
  try {
    return JSON.parse(
      await readFile(file.replace(/\.\w+$/, ".json"), "utf8")
    ) as Manifest
  } catch {
    return {}
  }
}

function jobsFor(manifest: Manifest, folderCrop: string): Job[] {
  if (!manifest.sections) {
    return [
      {
        crop: folderCrop,
        pdfPages: manifest.pages ? parsePages(manifest.pages) : undefined,
        offset: 0,
      },
    ]
  }
  const offset = manifest.pageOffset ?? 0
  return manifest.sections
    .filter((s) => !s.skip)
    .map((s) => {
      if (!isCrop(s.crop)) {
        throw new Error(
          `Unknown crop "${s.crop}" in manifest (see lib/crops.ts)`
        )
      }
      if (!s.pages && !s.pdfPages) {
        throw new Error(`Section "${s.title}" needs "pages" or "pdfPages"`)
      }
      return {
        crop: s.crop,
        topic: s.topic,
        section: s.title ?? s.topic,
        pdfPages: s.pdfPages
          ? parsePages(s.pdfPages)
          : parsePages(s.pages!, offset),
        offset: s.pdfPages ? 0 : offset,
      }
    })
}

// Text of one document, page by page; OCRs a few pages per call when the
// embedded text is unusable. OCR batches are cached on disk so an interrupted
// run (e.g. free-tier daily quota) resumes where it stopped.
class PdfReader {
  private src?: PDFDocument
  private constructor(
    private file: string,
    private bytes: Uint8Array,
    private pageTexts: string[],
    readonly needsOcr: boolean
  ) {}

  static async open(file: string) {
    const bytes = new Uint8Array(await readFile(file))
    const pdf = await getDocumentProxy(bytes.slice())
    const { text, totalPages } = await extractText(pdf, { mergePages: false })
    const needsOcr = looksGarbled(text.join("\n"), totalPages)
    if (needsOcr) console.log("  text extraction poor, using Gemini OCR")
    return new PdfReader(file, bytes, text, needsOcr)
  }

  get pageCount() {
    return this.pageTexts.length
  }

  // PDF pages (1-based) -> text
  async read(pages: number[]): Promise<string> {
    if (!this.needsOcr)
      return pages.map((p) => this.pageTexts[p - 1]).join("\n")

    const pad = (n: number) => String(n).padStart(4, "0")
    const range = `${pages[0]}-${pages[pages.length - 1]}`
    const cacheDir = path.join(OCR_CACHE, path.basename(this.file, ".pdf"))
    const cacheFile = path.join(
      cacheDir,
      `p${pad(pages[0])}-${pad(pages[pages.length - 1])}.txt`
    )
    const cached = await readFile(cacheFile, "utf8").catch(() => undefined)
    if (cached !== undefined) {
      console.log(`    PDF pages ${range}: cached`)
      return cached
    }

    this.src ??= await PDFDocument.load(this.bytes, { ignoreEncryption: true })
    const part = await PDFDocument.create()
    const copied = await part.copyPages(
      this.src,
      pages.map((p) => p - 1)
    )
    copied.forEach((page) => part.addPage(page))
    const data = await part.save()

    const result = await withRetry("OCR", () =>
      generateText({
        model: google(OCR_MODEL),
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all text from this document faithfully. Keep Telugu as Telugu and English as English. Keep table rows on one line each. Output plain text only.",
              },
              { type: "file", data, mediaType: "application/pdf" },
            ],
          },
        ],
      })
    )
    if (result.finishReason === "length") {
      console.log(`    PDF pages ${range}: WARNING output was cut off`)
    }
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cacheFile, result.text, "utf8")
    console.log(`    PDF pages ${range}: OCR done`)
    await sleep(4000)
    return result.text
  }
}

type Piece = { content: string; pages?: string }

async function store(
  pieces: Piece[],
  job: Job,
  source: string,
  state?: string
) {
  const supabase = getSupabase()
  const del = supabase
    .from("crop_knowledge")
    .delete()
    .eq("metadata->>source", source)
  const { error: delError } = job.section
    ? await del.eq("metadata->>section", job.section)
    : await del
  if (delError) throw delError

  for (let i = 0; i < pieces.length; i += BATCH) {
    const batch = pieces.slice(i, i + BATCH)
    const embeddings = await withRetry("embed", () =>
      embedDocuments(batch.map((p) => p.content))
    )
    const rows = batch.map(({ content, pages }, j) => ({
      content,
      metadata: {
        crop: job.crop,
        source,
        ...(job.topic && { topic: job.topic }),
        ...(job.section && { section: job.section }),
        ...(state && { state }),
        ...(pages && { pages }),
      },
      embedding: embeddings[j],
    }))
    const { error } = await supabase.from("crop_knowledge").insert(rows)
    if (error) throw error
    if (i + BATCH < pieces.length) await sleep(EMBED_PAUSE_MS)
  }
}

async function ingest(file: string, folderCrop: string) {
  const manifest = await readManifest(file)
  const source = manifest.source ?? path.basename(file)
  const jobs = jobsFor(manifest, folderCrop).filter(
    (j) => !ONLY_CROP || j.crop === ONLY_CROP
  )
  if (jobs.length === 0) return
  console.log(
    `Ingesting ${path.relative(ROOT, file)} (${jobs.length} section(s))`
  )

  const isPdf = path.extname(file).toLowerCase() === ".pdf"
  const reader = isPdf ? await PdfReader.open(file) : undefined

  for (const job of jobs) {
    const label = `${job.crop}${job.topic ? `/${job.topic}` : ""}`
    console.log(`  ${label}${job.section ? ` — ${job.section}` : ""}`)
    // Short header on every piece: better retrieval for ~10 tokens.
    const header = `${CROPS[job.crop as keyof typeof CROPS] ?? job.crop} (${label}): `

    const pieces: Piece[] = []
    if (!reader) {
      const text = await readFile(file, "utf8")
      pieces.push(...chunk(text).map((c) => ({ content: header + c })))
    } else {
      const all = Array.from({ length: reader.pageCount }, (_, i) => i + 1)
      const pages = (job.pdfPages ?? all).filter((p) => p <= reader.pageCount)
      // Batches never cross a section, so every piece belongs to one crop.
      for (let i = 0; i < pages.length; i += OCR_PAGES_PER_CALL) {
        const batch = pages.slice(i, i + OCR_PAGES_PER_CALL)
        const first = batch[0] - job.offset
        const last = batch[batch.length - 1] - job.offset
        const cited = first === last ? `${first}` : `${first}-${last}`
        const text = await reader.read(batch)
        pieces.push(
          ...chunk(text).map((c) => ({ content: header + c, pages: cited }))
        )
      }
    }

    if (pieces.length === 0) {
      console.log("    no text found, skipped")
      continue
    }
    await store(pieces, job, source, manifest.state)
    console.log(`    stored ${pieces.length} chunks (${label})`)
  }
}

async function main() {
  const dirs = await readdir(ROOT, { withFileTypes: true }).catch(() => [])
  if (dirs.length === 0) {
    return console.log(
      "Put files in data/pdfs/<crop>/, e.g. data/pdfs/paddy/guide.pdf"
    )
  }
  for (const dir of dirs.filter((d) => d.isDirectory())) {
    for (const f of await readdir(path.join(ROOT, dir.name))) {
      if (/\.(pdf|txt|md)$/i.test(f))
        await ingest(path.join(ROOT, dir.name, f), dir.name)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
