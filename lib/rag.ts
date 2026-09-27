import { google } from "@ai-sdk/google"
import { embed, embedMany } from "ai"
import { redactBanned } from "@/lib/banned-pesticides"
import type { Crop } from "@/lib/crops"
import { getSupabase } from "@/lib/supabase"

const model = google.textEmbeddingModel("gemini-embedding-001")

// 768 must match vector(768) in supabase/migrations/0001_init_pgvector.sql
const options = (taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT") => ({
  google: { outputDimensionality: 768, taskType },
})

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model,
    value: text,
    providerOptions: options("RETRIEVAL_QUERY"),
  })
  return embedding
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model,
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

const MAX_CHARS = 1000

// With a known crop, only that crop's text plus general advice is searched.
export async function searchKnowledge(query: string, crop?: Crop) {
  try {
    const { data, error } = await getSupabase().rpc("match_crop_knowledge", {
      query_embedding: await embedQuery(query),
      match_threshold: 0.6, // relevant Telugu matches ~0.7+, off-topic ~0.5
      match_count: 3,
      crops: crop && crop !== "general" ? [crop, "general"] : null,
    })
    if (error) throw error

    const results = ((data ?? []) as Match[])
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
