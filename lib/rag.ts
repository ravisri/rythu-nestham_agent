import { embed, embedMany } from "ai"
import { embedOptions as options, embeddingModel } from "@/lib/ai"
import { redactBanned } from "@/lib/banned-pesticides"
import type { Crop } from "@/lib/crops"
import { getSupabase } from "@/lib/supabase"

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: await embeddingModel(),
    value: text,
    providerOptions: options("RETRIEVAL_QUERY"),
  })
  return embedding
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: await embeddingModel(),
    values: texts,
    providerOptions: options("RETRIEVAL_DOCUMENT"),
  })
  return embeddings
}

type Match = {
  content: string
  metadata: {
    crop?: string
    topic?: string
    source?: string
    pages?: string
  } | null
}

const MAX_CHARS = 800
const CANDIDATES = 12
const MAX_RESULTS = 6
const MAX_PER_SOURCE = 2 // so one guide can't fill every slot

// Best matches first with at most MAX_PER_SOURCE per file, so several guides
// get a say; if fewer files match, the free slots go to the next-best chunks.
function diverse(rows: Match[]): Match[] {
  const perSource = new Map<string, number>()
  const picked = new Set<Match>()
  for (const row of rows) {
    const source = row.metadata?.source ?? ""
    const used = perSource.get(source) ?? 0
    if (used >= MAX_PER_SOURCE) continue
    perSource.set(source, used + 1)
    picked.add(row)
    if (picked.size === MAX_RESULTS) break
  }
  for (const row of rows) {
    if (picked.size === MAX_RESULTS) break
    picked.add(row)
  }
  // Keep similarity order (rows arrive best-first).
  return rows.filter((row) => picked.has(row))
}

// With a known crop, only that crop's text plus general advice is searched.
export async function searchKnowledge(query: string, crop?: Crop) {
  try {
    const { data, error } = await getSupabase().rpc("match_crop_knowledge", {
      query_embedding: await embedQuery(query),
      match_threshold: 0.6, // relevant Telugu matches ~0.7+, off-topic ~0.5
      match_count: CANDIDATES,
      crops: crop && crop !== "general" ? [crop, "general"] : null,
    })
    if (error) throw error

    const results = diverse((data ?? []) as Match[])
      .map((row) => ({
        text: redactBanned(row.content).slice(0, MAX_CHARS),
        crop: row.metadata?.crop,
        topic: row.metadata?.topic,
        source: row.metadata?.source,
        pages: row.metadata?.pages,
      }))
      .filter((r) => r.text.length > 0)

    return { results }
  } catch (error) {
    console.error("searchKnowledge failed:", error)
    return { results: [], unavailable: true }
  }
}
