// Text for the Telugu voice only (screen text is unchanged): units and symbols
// become words, otherwise the te-IN voice spells "g/L" letter by letter and
// reads "మి.లీ." as two clipped syllables.

const TE = "\\u0C00-\\u0C7F"
// Not followed by another letter: "g" but not "gram", "లీ." but not "లీటరు".
const END = `(?![A-Za-z${TE}])`
// Not preceded by a Telugu letter: "మళ్లీ." must stay a word.
const START = `(?<![${TE}])`

const per = (unit: string, words: string) =>
  [new RegExp(`\\s*\\/\\s*(?:${unit})${END}`, "g"), ` ${words}`] as const
const afterNumber = (unit: string, words: string) =>
  [new RegExp(`(\\d)\\s*(?:${unit})${END}`, "g"), `$1 ${words}`] as const
const standalone = (unit: string, words: string) =>
  [new RegExp(`${START}(?:${unit})`, "g"), words] as const

const RULES: (readonly [RegExp, string])[] = [
  // "per" first: 2 g/L -> 2 g ఒక లీటరు నీటికి -> 2 గ్రాములు ఒక లీటరు నీటికి
  per("లీటర్లు|లీటరు|లీటర్|లీ\\.?|litres?|liters?|lit|L|l", "ఒక లీటరు నీటికి"),
  per("ఎకరానికి|ఎకరాకు|ఎకరం|ఎకరా|acres?|ac", "ఒక ఎకరానికి"),
  per("కి\\.?\\s?గ్రా\\.?|కిలో|kg|Kg|KG", "ఒక కిలోకి"),
  // Units after a number.
  afterNumber("ml|mL|ML|మి\\.?\\s?లీ\\.?", "మిల్లీలీటర్లు"),
  afterNumber("kg|Kg|KG|కి\\.?\\s?గ్రా\\.?", "కిలోలు"),
  afterNumber("grams?|gms?|g|గ్రా\\.?", "గ్రాములు"),
  afterNumber("litres?|liters?|lit|L|l|లీ\\.?", "లీటర్లు"),
  [/(\d)\s*%/g, "$1 శాతం"],
  // Telugu abbreviations anywhere ("మి.లీ. చొప్పున").
  standalone("మి\\.\\s?లీ\\.?", "మిల్లీలీటర్లు"),
  standalone("కి\\.\\s?గ్రా\\.?", "కిలోలు"),
  standalone("గ్రా\\.", "గ్రాములు"),
  standalone("లీ\\.", "లీటర్లు"),
  // "@ 2 గ్రా" = at the rate of: the dose that follows says it.
  [/@\s*/g, ""],
  [/(\d)\s*[-–]\s*(\d)/g, "$1 నుండి $2"],
  // Other "a / b" between words: a short pause, not "slash".
  [/(?<=[^\d\s])\s*\/\s*(?=[^\d\s])/g, ", "],
]

export function toSpeechText(text: string): string {
  return RULES.reduce((out, [pattern, words]) => out.replace(pattern, words), text)
}
