// Usage: npm run ingest                  (all files under data/pdfs/<crop>/:
//                                         .pdf .docx .txt .md and images .jpg .png .webp)
// Non-Telugu text (English, Hindi, ...) is translated to Telugu once (TRANSLATE_MODEL,
// cached in data/translations/) before embedding, so Telugu questions find it.
//        npm run ingest -- --crop paddy  (only paddy sections / folders)
//        npm run ingest -- --force       (redo sections that are already stored)
//        ... --sections cotton/cultivation,general/irrigation  (only those manifest sections)
//        npm run ingest:file chilli_file.docx   (only that file; add --force to re-embed it)
// Never duplicates: a file replaces its own rows; the same file under another name and
// chunks already stored from another file are skipped.
//        npm run ingest:ocr              (only fill the OCR cache, no embedding / DB writes)
// Re-running continues where it stopped: stored sections are skipped, OCR pages come from data/ocr/.
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the API key
// for the OCR_MODEL / EMBEDDING_MODEL providers (default Google: GOOGLE_GENERATIVE_AI_API_KEY).
// OCR (only when the PDF text layer is garbled): Google Vision if GOOGLE_VISION_API_KEY is
// set (per-page price, cheapest), else LLM OCR via OCR_MODEL. Force with OCR_ENGINE=vision|llm.
// Optional manifest "<pdf name>.json" next to a PDF:
//   { "pages": "120-175" }  limits OCR to those PDF pages, or
//   { "source", "state", "pageOffset", "sections": [{ crop, topic, title, pages | pdfPages, skip? }] }
//   splits a multi-crop book; "pages" are printed page numbers (PDF page = printed + pageOffset).
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { APICallError, generateText, RetryError } from "ai"
import mammoth from "mammoth"
import { PDFDocument } from "pdf-lib"
import { extractText, getDocumentProxy } from "unpdf"
import { ocrModel, reasoningOptions, translateModel } from "@/lib/ai"
import { CROPS, isCrop } from "@/lib/crops"
import {
  visionEnabled,
  VisionError,
  visionImageOcr,
  visionOcr,
} from "@/lib/ocr"
import { embedDocuments } from "@/lib/rag"
import { getSupabase } from "@/lib/supabase"

const ROOT = path.join(process.cwd(), "data", "pdfs")
const OCR_CACHE = path.join(process.cwd(), "data", "ocr")
const TRANSLATION_CACHE = path.join(process.cwd(), "data", "translations")
const SUPPORTED = /\.(pdf|txt|md|docx|jpe?g|png|webp)$/i
const TRANSLATE_WORDS = 700 // per call: ~1 page in, ~3k Telugu tokens out
const OCR_PAGES_PER_CALL = 5
const CHUNK_WORDS = 120 // ~800 Telugu chars; must fit MAX_CHARS in lib/rag.ts
const OVERLAP_WORDS = 20
// Free-tier gemini-embedding-001 allows ~30k tokens/min; 10 Telugu chunks ≈ 8k tokens.
const BATCH = 10
const EMBED_PAUSE_MS = 20_000
const ONLY_CROP = process.argv.includes("--crop")
  ? process.argv[process.argv.indexOf("--crop") + 1]
  : undefined
// --sections cotton/cultivation,general/irrigation -> only those manifest sections
const ONLY_SECTIONS = process.argv.includes("--sections")
  ? new Set(process.argv[process.argv.indexOf("--sections") + 1]?.split(","))
  : undefined
// --file chilli_file.docx -> only that file (name, case-insensitive)
const ONLY_FILE = process.argv.includes("--file")
  ? process.argv[process.argv.indexOf("--file") + 1]?.toLowerCase()
  : undefined
const FORCE = process.argv.includes("--force")
const OCR_ONLY = process.argv.includes("--ocr-only")
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

class DailyLimitError extends Error {}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const message = String((error as Error)?.message ?? error)
      if (/PerDay|per day/i.test(message)) throw new DailyLimitError(message)
      // Bad model name / API key / request won't fix itself: fail now.
      const retryable =
        RetryError.isInstance(error) ||
        (APICallError.isInstance(error) && error.isRetryable) ||
        (error instanceof VisionError && error.retryable)
      if (!retryable || attempt >= 5) throw error
      const reason = message.slice(0, 120)
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
    if (needsOcr) {
      const engine = visionEnabled() ? "Google Vision" : ocrModel().modelId
      console.log(`  text extraction poor, using OCR (${engine})`)
    }
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
    if (cached !== undefined && garbledShare(cached) <= GARBLED) {
      console.log(`    PDF pages ${range}: cached`)
      return cached
    }
    if (cached !== undefined) {
      console.log(`    PDF pages ${range}: cached text is garbled, OCR again`)
    }

    this.src ??= await PDFDocument.load(this.bytes, { ignoreEncryption: true })
    const part = await PDFDocument.create()
    const copied = await part.copyPages(
      this.src,
      pages.map((p) => p - 1)
    )
    copied.forEach((page) => part.addPage(page))
    const data = await part.save()

    const text = visionEnabled()
      ? await withRetry("OCR", () => visionOcr(data, pages.length))
      : await llmOcr(data, range)
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cacheFile, text, "utf8")
    console.log(`    PDF pages ${range}: OCR done`)
    if (!visionEnabled()) await sleep(4000)
    return text
  }
}

// Claude also receives the PDF text layer, which is garbled for legacy Telugu
// fonts — tell it to read the page images instead.
const PDF_OCR_PROMPT =
  "Transcribe the page IMAGES faithfully. Ignore the PDF's embedded text layer: it may use a broken legacy font encoding (looks like 'X¯óuÛÑø£'). Write Telugu in Unicode Telugu script and English as English. Keep table rows on one line each, no markdown tables. Output plain text only."
const IMAGE_OCR_PROMPT =
  "Transcribe all text in this image faithfully (posters, leaflets, tables, labels). Write Telugu in Unicode Telugu script and English as English. Keep table rows on one line each, no markdown tables. Output plain text only. If the image has no readable text, output nothing."

async function llmOcr(
  data: Uint8Array,
  label: string,
  mediaType = "application/pdf"
): Promise<string> {
  const model = ocrModel()
  const result = await withRetry("OCR", () =>
    generateText({
      model,
      providerOptions: reasoningOptions(model.modelId, "none"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: mediaType === "application/pdf" ? PDF_OCR_PROMPT : IMAGE_OCR_PROMPT,
            },
            { type: "file", data, mediaType },
          ],
        },
      ],
    })
  )
  if (result.finishReason === "length") {
    console.log(`    ${label}: WARNING output was cut off`)
  }
  return result.text
}

const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

// OCR one image file; cached in data/ocr/<file name>.txt.
async function ocrImage(file: string, mediaType: string): Promise<string> {
  const cacheFile = path.join(OCR_CACHE, `${path.basename(file)}.txt`)
  const cached = await readFile(cacheFile, "utf8").catch(() => undefined)
  if (cached !== undefined) {
    console.log("    image: cached")
    return cached
  }
  const data = new Uint8Array(await readFile(file))
  const text = visionEnabled()
    ? await withRetry("OCR", () => visionImageOcr(data))
    : await llmOcr(data, "image", mediaType)
  await mkdir(OCR_CACHE, { recursive: true })
  await writeFile(cacheFile, text, "utf8")
  console.log("    image: OCR done")
  return text
}

// Text of a non-PDF file: Word document, image (OCR) or plain text / markdown.
async function readDocument(file: string): Promise<string> {
  const ext = path.extname(file).toLowerCase()
  if (ext === ".docx") {
    return (await mammoth.extractRawText({ path: file })).value
  }
  const mediaType = IMAGE_TYPES[ext]
  if (mediaType) return ocrImage(file, mediaType)
  return readFile(file, "utf8")
}

// Telugu share of all letters (marks/digits/punctuation ignored).
function teluguShare(text: string): number {
  const telugu = text.match(/[ఀ-౿]/g)?.length ?? 0
  const other = text.match(/[^\s\d\p{P}\p{S}ఀ-౿]/gu)?.length ?? 0
  return telugu + other === 0 ? 1 : telugu / (telugu + other)
}

const TRANSLATE_PROMPT = `Translate the user's agricultural text into simple, conversational Telugu that farmers in Telangana and Andhra Pradesh understand.
- Translate everything faithfully: do not add, remove or summarise anything.
- Keep all numbers, doses and units exactly (ml, g, kg, litre, acre, %, days).
- Write pesticide, chemical, fertiliser and variety names in Telugu letters followed by the original name in brackets, e.g. ఇమిడాక్లోప్రిడ్ (Imidacloprid).
- Keep table rows on one line each. Output only the Telugu text.`

// Translate one segment; cached by content hash in data/translations/.
async function translate(segment: string): Promise<string> {
  const cacheFile = path.join(TRANSLATION_CACHE, `${hashOf(segment)}.txt`)
  const cached = await readFile(cacheFile, "utf8").catch(() => undefined)
  if (cached !== undefined && teluguShare(cached) >= 0.5) return cached

  const model = translateModel()
  const run = (system: string) =>
    withRetry("translate", () =>
      generateText({
        model,
        system,
        prompt: segment,
        maxOutputTokens: 8000,
        providerOptions: reasoningOptions(model.modelId, "none"),
      })
    )
  let result = await run(TRANSLATE_PROMPT)
  // Small models sometimes leave headings / lists in English: retry once.
  if (teluguShare(result.text) < 0.5) {
    result = await run(`${TRANSLATE_PROMPT}\n${TRANSLATE_STRICT}`)
  }
  if (result.finishReason === "length") {
    console.log("    translate: WARNING output was cut off")
  }
  if (teluguShare(result.text) < 0.5) {
    console.log("    translate: WARNING result is still mostly not Telugu")
    return result.text // not cached, so the next run tries again
  }
  await mkdir(TRANSLATION_CACHE, { recursive: true })
  await writeFile(cacheFile, result.text, "utf8")
  await sleep(2000)
  return result.text
}

const TRANSLATE_STRICT =
  "IMPORTANT: translate EVERY sentence into Telugu, including English headings, lists and table text. Never leave an English sentence untranslated; only chemical/variety names in brackets stay English."

// Legacy Telugu fonts read as Latin-1 junk, e.g. "ˇø£ bı\+ qT+&ç".
function garbledShare(text: string): number {
  const junk = text.match(/[À-ÿ¯£∑≈√‡˚˜˙ˆˇ]/g)?.length ?? 0
  return junk / Math.max(1, text.length)
}
const GARBLED = 0.03

// Any language -> Telugu (Telugu questions match Telugu text best).
async function toTelugu(text: string): Promise<string> {
  if (!text.trim() || teluguShare(text) >= 0.5) return text
  const words = text.split(/\s+/).filter(Boolean)
  const parts: string[] = []
  for (let i = 0; i < words.length; i += TRANSLATE_WORDS) {
    parts.push(await translate(words.slice(i, i + TRANSLATE_WORDS).join(" ")))
  }
  console.log(`    translated to Telugu (${parts.length} part(s))`)
  return parts.join("\n")
}

type Piece = { content: string; pages?: string; translated?: boolean }

// Chunk hashes already stored by OTHER files (so the same text is never stored twice).
async function storedElsewhere(
  hashes: string[],
  source: string
): Promise<Map<string, string>> {
  const found = new Map<string, string>() // hash -> source that has it
  for (let i = 0; i < hashes.length; i += 100) {
    const { data, error } = await getSupabase()
      .from("crop_knowledge")
      .select("hash:metadata->>hash, source:metadata->>source")
      .in("metadata->>hash", hashes.slice(i, i + 100))
      .neq("metadata->>source", source)
    if (error) throw error
    for (const row of data as { hash: string; source: string }[]) {
      found.set(row.hash, row.source)
    }
  }
  return found
}

// Returns how many chunks were stored (0 = nothing new).
async function store(
  all: Piece[],
  job: Job,
  source: string,
  fileHash: string,
  state?: string
): Promise<number> {
  const supabase = getSupabase()
  const elsewhere = await storedElsewhere(
    all.map((p) => hashOf(p.content)),
    source
  )
  const pieces = all.filter((p) => !elsewhere.has(hashOf(p.content)))
  if (elsewhere.size > 0) {
    const from = [...new Set(elsewhere.values())].join(", ")
    console.log(
      `    skipped ${all.length - pieces.length} chunk(s) already stored from ${from}`
    )
  }
  if (pieces.length === 0) return 0

  const hashes = pieces.map((p) => hashOf(p.content))
  if (await isUnchanged(job, source, hashes)) {
    await addFileHash(job, source, fileHash)
    console.log("    text unchanged, embedding skipped")
    return 0
  }
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
    const rows = batch.map(({ content, pages, translated }, j) => ({
      content,
      metadata: {
        hash: hashes[i + j],
        file_hash: fileHash,
        crop: job.crop,
        source,
        ...(job.topic && { topic: job.topic }),
        ...(job.section && { section: job.section }),
        ...(state && { state }),
        ...(pages && { pages }),
        ...(translated && { translated: true }),
      },
      embedding: embeddings[j],
    }))
    const { error } = await supabase.from("crop_knowledge").insert(rows)
    if (error) throw error
    if (i + BATCH < pieces.length) await sleep(EMBED_PAUSE_MS)
  }
  return pieces.length
}

// Rows stored before file_hash existed: add it (no re-embedding needed).
async function addFileHash(job: Job, source: string, fileHash: string) {
  const query = getSupabase()
    .from("crop_knowledge")
    .select("id, metadata")
    .eq("metadata->>source", source)
    .is("metadata->>file_hash", null)
  const { data, error } = job.section
    ? await query.eq("metadata->>section", job.section)
    : await query
  if (error) throw error
  for (const row of data as { id: string; metadata: Record<string, unknown> }[]) {
    const { error: updateError } = await getSupabase()
      .from("crop_knowledge")
      .update({ metadata: { ...row.metadata, file_hash: fileHash } })
      .eq("id", row.id)
    if (updateError) throw updateError
  }
}

// The same file under another name / folder is never embedded twice.
async function storedAs(fileHash: string, source: string) {
  const { data, error } = await getSupabase()
    .from("crop_knowledge")
    .select("source:metadata->>source")
    .eq("metadata->>file_hash", fileHash)
    .neq("metadata->>source", source)
    .limit(1)
  if (error) throw error
  return (data as { source: string }[])[0]?.source
}

const hashOf = (text: string) =>
  createHash("sha1").update(text).digest("hex").slice(0, 16)

// With --force, re-embedding identical text only wastes embed quota.
async function isUnchanged(job: Job, source: string, hashes: string[]) {
  const query = getSupabase()
    .from("crop_knowledge")
    .select("hash:metadata->>hash")
    .eq("metadata->>source", source)
  const { data, error } = job.section
    ? await query.eq("metadata->>section", job.section)
    : await query
  if (error) throw error
  const stored = (data as { hash: string | null }[]).map((r) => r.hash).sort()
  const fresh = [...hashes].sort()
  return (
    stored.length === fresh.length && stored.every((h, i) => h === fresh[i])
  )
}

async function isStored(job: Job, source: string): Promise<boolean> {
  const query = getSupabase()
    .from("crop_knowledge")
    .select("id", { count: "exact", head: true })
    .eq("metadata->>source", source)
  const { count, error } = job.section
    ? await query.eq("metadata->>section", job.section)
    : await query
  if (error) throw error
  return (count ?? 0) > 0
}

async function ingest(file: string, folderCrop: string) {
  const manifest = await readManifest(file)
  const source = manifest.source ?? path.basename(file)
  const jobs = jobsFor(manifest, folderCrop).filter(
    (j) =>
      (!ONLY_CROP || j.crop === ONLY_CROP) &&
      (!ONLY_SECTIONS || ONLY_SECTIONS.has(`${j.crop}/${j.topic}`))
  )
  if (jobs.length === 0) return
  console.log(
    `Ingesting ${path.relative(ROOT, file)} (${jobs.length} section(s))`
  )

  const ext = path.extname(file).toLowerCase()
  const isPdf = ext === ".pdf"
  if (OCR_ONLY && !isPdf && !IMAGE_TYPES[ext]) return

  const fileHash = hashOf((await readFile(file)).toString("base64"))
  const duplicateOf = await storedAs(fileHash, source)
  if (duplicateOf) {
    console.log(`  same file already embedded as "${duplicateOf}" — skipped`)
    return
  }
  let reader: PdfReader | undefined

  for (const job of jobs) {
    const label = `${job.crop}${job.topic ? `/${job.topic}` : ""}`
    console.log(`  ${label}${job.section ? ` — ${job.section}` : ""}`)
    if (!FORCE && (await isStored(job, source))) {
      console.log("    already stored, skipped (use --force to redo)")
      continue
    }
    if (isPdf) reader ??= await PdfReader.open(file)
    // Short header on every piece: better retrieval for ~10 tokens.
    const header = `${CROPS[job.crop as keyof typeof CROPS] ?? job.crop} (${label}): `

    // Raw text per part: a PDF page batch, or the whole docx / image / text file.
    const parts: { text: string; pages?: string }[] = []
    if (!reader) {
      parts.push({ text: await readDocument(file) })
    } else {
      const total = reader.pageCount
      const all = Array.from({ length: total }, (_, i) => i + 1)
      const pages = (job.pdfPages ?? all).filter((p) => p <= total)
      // Batches never cross a section, so every piece belongs to one crop.
      for (let i = 0; i < pages.length; i += OCR_PAGES_PER_CALL) {
        const batch = pages.slice(i, i + OCR_PAGES_PER_CALL)
        const first = batch[0] - job.offset
        const last = batch[batch.length - 1] - job.offset
        const cited = first === last ? `${first}` : `${first}-${last}`
        parts.push({ text: await reader.read(batch), pages: cited })
      }
    }

    if (OCR_ONLY) {
      console.log("    OCR complete")
      continue
    }

    const pieces: Piece[] = []
    let dropped = 0
    for (const part of parts) {
      const telugu = await toTelugu(part.text)
      for (const c of chunk(telugu)) {
        // Unreadable legacy-font junk would only pollute search results.
        if (garbledShare(c) > GARBLED) {
          dropped++
          continue
        }
        // A chunk the document-level translation left in English.
        const english = teluguShare(c) < 0.5
        pieces.push({
          content: header + (english ? await translate(c) : c),
          pages: part.pages,
          translated: english || telugu !== part.text,
        })
      }
    }
    if (dropped) console.log(`    dropped ${dropped} garbled chunk(s)`)
    if (pieces.length === 0) {
      console.log("    no text found, skipped")
      continue
    }
    const stored = await store(pieces, job, source, fileHash, manifest.state)
    if (stored > 0) console.log(`    stored ${stored} chunks (${label})`)
  }
}

async function main() {
  const dirs = await readdir(ROOT, { withFileTypes: true }).catch(() => [])
  if (dirs.length === 0) {
    return console.log(
      "Put files in data/pdfs/<crop>/, e.g. data/pdfs/paddy/guide.pdf"
    )
  }
  let matched = false
  for (const dir of dirs.filter((d) => d.isDirectory())) {
    for (const f of await readdir(path.join(ROOT, dir.name))) {
      // "~$x.docx" = Word's temporary lock file while the document is open.
      if (!SUPPORTED.test(f) || f.startsWith("~$")) continue
      if (ONLY_FILE && f.toLowerCase() !== ONLY_FILE) continue
      matched = true
      await ingest(path.join(ROOT, dir.name, f), dir.name)
    }
  }
  if (ONLY_FILE && !matched) {
    console.error(
      `No file "${ONLY_FILE}" found in data/pdfs/<crop>/ (supported: pdf, docx, txt, md, jpg, png, webp)`
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  if (error instanceof DailyLimitError) {
    console.error(
      "\nDaily API limit reached — progress is saved, run npm run ingest again tomorrow."
    )
  } else {
    console.error(error)
  }
  process.exit(1)
})
