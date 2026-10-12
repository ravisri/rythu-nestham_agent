// Organic preparations a farmer may not know how to make. When an answer names
// one, a "how to make it?" question is offered under it (no AI call until tapped).
// Only preparations whose recipes are in crop_knowledge, so the answer is real.

type Prep = { pattern: RegExp; question: string }

const PREPS: Prep[] = [
  { pattern: /నీమాస్త్ర/, question: "నీమాస్త్రం ఎలా తయారు చేయాలి?" },
  { pattern: /బ్రహ్మాస్త్ర/, question: "బ్రహ్మాస్త్రం ఎలా తయారు చేయాలి?" },
  { pattern: /ఘన\s?జీవామృత/, question: "ఘన జీవామృతం ఎలా తయారు చేయాలి?" },
  // Plain జీవామృతం, not the "ఘన" kind above.
  { pattern: /(?<!ఘన\s?)జీవామృత/, question: "జీవామృతం ఎలా తయారు చేయాలి?" },
  { pattern: /బీజామృత/, question: "బీజామృతం ఎలా తయారు చేయాలి?" },
  { pattern: /పంచగవ్య/, question: "పంచగవ్య ఎలా తయారు చేయాలి?" },
  { pattern: /వేప(\sగింజల)?\s?కషాయ/, question: "వేప గింజల కషాయం ఎలా తయారు చేయాలి?" },
  { pattern: /పుల్ల(టి)?\s?మజ్జిగ/, question: "పుల్లటి మజ్జిగ ద్రావణం ఎలా తయారు చేయాలి?" },
  { pattern: /వర్మీ?\s?కంపోస్ట/, question: "వర్మి కంపోస్టు ఎలా తయారు చేయాలి?" },
]

const MAX = 3

// "How to make X?" questions for preparations named in the answer, in the order
// they appear; skips ones the farmer already asked about or already suggested.
export function howToQuestions(
  answer: string,
  asked = "",
  exclude: string[] = []
): string[] {
  return PREPS.flatMap((prep) => {
    const at = answer.search(prep.pattern)
    if (at < 0 || prep.pattern.test(asked)) return []
    if (exclude.some((q) => prep.pattern.test(q))) return []
    return [{ at, question: prep.question }]
  })
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX)
    .map((p) => p.question)
}
