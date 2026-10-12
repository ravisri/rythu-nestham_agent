// Detects OCR junk that is still in Telugu letters (so script checks miss it).
// Used by the ingest chunk guard and for cleaning crop_knowledge.

const TELUGU = /[ఀ-౿]/g

// Why a chunk of text is junk, or null if it looks like real text.
export function junkReason(text: string): string | null {
  const telugu = text.match(TELUGU)?.length ?? 0

  // Gibberish like "నీకీని ఫెటీని టీటెటుటీ": normal text has ~1% "ీ" signs
  // (99% of real chunks < 5%); garbled OCR has 12-21%.
  if (telugu >= 40 && (text.match(/ీ/g)?.length ?? 0) / telugu > 0.09) {
    return "garbled"
  }

  // A Telugu syllable repeated 5+ times in a row: "సిసిసిసిసి".
  if (/([ఀ-౿]{1,3})\1{4,}/u.test(text)) return "repetition"

  // OCR "hallucination" looping a handful of words: "సందర్భం సందర్భం …".
  // Measured: loops have < 25% unique words and 3 words fill > 60% of the text;
  // variety / crop-plan tables (మషూరి, వరి repeated) stay >= 30% and < 55%.
  // Only Telugu words count, so "C", "|", numbers and codes don't matter.
  const words = (text.match(/[ఀ-౿]+/g) ?? []).filter((w) => w.length >= 3)
  if (words.length >= 20) {
    const counts = new Map<string, number>()
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1)
    const top3 = [...counts.values()]
      .sort((a, b) => b - a)
      .slice(0, 3)
      .reduce((sum, n) => sum + n, 0)
    if (counts.size / words.length < 0.25 && top3 / words.length > 0.55) {
      return "repetition"
    }
  }
  return null
}
