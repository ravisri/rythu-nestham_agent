// Usage: npm run lexicon
// Builds public/telugu-words.txt (most frequent first) from the Telugu text in
// crop_knowledge + curated words. The chat's Telugu typing uses it to turn loose
// spellings into real words (vache -> వచ్చే). Re-run after ingesting new files.
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { CURATED_WORDS } from "@/lib/telugu-translit"
import { getSupabase } from "@/lib/supabase"

// Everyday words farmers type that guides rarely contain.
const EVERYDAY = [
  "వచ్చే", "వచ్చింది", "వచ్చాయి", "వస్తుంది", "వస్తున్నాయి", "ఏమిటి", "ఏమి", "ఎందుకు",
  "ఎలా", "ఎప్పుడు", "ఎంత", "ఎన్ని", "చేయాలి", "చేయవచ్చా", "ఉంది", "ఉన్నాయి", "లేదు",
  "కావాలి", "చెప్పండి", "నా", "మా", "పొలం", "పొలంలో", "ఆకులు", "కాయలు", "పూత", "రోజులు",
]

async function main() {
  const counts = new Map<string, number>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase()
      .from("crop_knowledge")
      .select("content")
      .range(from, from + 999)
    if (error) throw error
    for (const { content } of data as { content: string }[]) {
      const words = content.replace(/[‌‍]/g, "").match(/[ఀ-౿]+/g)
      for (const word of words ?? []) {
        if (word.length > 1) counts.set(word, (counts.get(word) ?? 0) + 1)
      }
    }
    if (data.length < 1000) break
  }
  // Curated + everyday words always rank high.
  for (const word of [...CURATED_WORDS, ...EVERYDAY]) {
    counts.set(word, (counts.get(word) ?? 0) + 1000)
  }

  // Words seen only once are mostly rare forms or OCR noise: skip them (smaller download).
  const words = [...counts]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
  const file = path.join(process.cwd(), "public", "telugu-words.txt")
  await writeFile(file, words.join("\n"), "utf8")
  console.log(`wrote ${words.length} words -> public/telugu-words.txt`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
