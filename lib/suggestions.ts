// "Next question" suggestions ride on the answer itself (no extra AI call):
// the model ends with one line "<<NEXT>> question 1 || question 2".
// Client-safe: the chat UI and the chat route both use these.

export const NEXT_MARKER = "<<NEXT>>"

// Answer text without the suggestion line, plus up to 2 suggestions.
// While streaming, a half-written marker ("<<", "<<NE") is hidden too.
export function splitSuggestions(text: string): {
  answer: string
  suggestions: string[]
} {
  const at = text.indexOf(NEXT_MARKER)
  if (at < 0) {
    const partial = text.match(/<{1,2}N?E?X?T?>?$/)
    return {
      answer: partial ? text.slice(0, partial.index).trimEnd() : text,
      suggestions: [],
    }
  }
  const suggestions = text
    .slice(at + NEXT_MARKER.length)
    .split("||")
    .map((q) => q.replace(/[*_`#]/g, "").trim())
    .filter((q) => q.length > 3)
    .slice(0, 2)
  return { answer: text.slice(0, at).trimEnd(), suggestions }
}

export const stripSuggestions = (text: string) => splitSuggestions(text).answer
