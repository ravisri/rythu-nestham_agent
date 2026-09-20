import { google } from "@ai-sdk/google"
import { embed, embedMany } from "ai"
import { redactBanned } from "@/lib/banned-pesticides"
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
  metadata: { crop?: string; source?: string } | null
}

const MAX_CHARS = 900

export async function searchKnowledge(query: string) {
  try {
    const { data, error } = await getSupabase().rpc("match_crop_knowledge", {
      query_embedding: await embedQuery(query),
      match_threshold: 0.5,
      match_count: 3,
    })
    if (error) throw error

    const results = ((data ?? []) as Match[])
      .map((row) => ({
        text: redactBanned(row.content).slice(0, MAX_CHARS),
        crop: row.metadata?.crop,
        source: row.metadata?.source,
      }))
      .filter((r) => r.text.length > 0)

    return { results }
  } catch (error) {
    console.error("searchKnowledge failed:", error)
    return { results: [], unavailable: true }
  }
}
