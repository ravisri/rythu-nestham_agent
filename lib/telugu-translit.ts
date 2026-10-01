// English letters -> Telugu script while typing (mirchi -> మిర్చి).
// Built-in phonetic rules (RTS / Lekhini style): free, offline, no API.

const VIRAMA = "్"
const ANUSVARA = "ం"

// [roman, letter at word start, vowel sign after a consonant]
const VOWELS: [string, string, string][] = [
  ["aa", "ఆ", "ా"], ["A", "ఆ", "ా"],
  ["ai", "ఐ", "ై"], ["au", "ఔ", "ౌ"], ["ou", "ఔ", "ౌ"],
  ["ii", "ఈ", "ీ"], ["ee", "ఈ", "ీ"], ["I", "ఈ", "ీ"],
  ["uu", "ఊ", "ూ"], ["oo", "ఊ", "ూ"], ["U", "ఊ", "ూ"],
  ["Ru", "ఋ", "ృ"], ["ae", "ఏ", "ే"], ["E", "ఏ", "ే"], ["O", "ఓ", "ో"],
  ["a", "అ", ""], ["i", "ఇ", "ి"], ["u", "ఉ", "ు"], ["e", "ఎ", "ె"], ["o", "ఒ", "ొ"],
]

const CONSONANTS: [string, string][] = [
  ["ksh", "క్ష"], ["chh", "ఛ"], ["Ch", "ఛ"],
  ["kh", "ఖ"], ["gh", "ఘ"], ["ch", "చ"], ["jh", "ఝ"],
  ["Th", "ఠ"], ["Dh", "ఢ"], ["th", "థ"], ["dh", "ధ"],
  ["ph", "ఫ"], ["bh", "భ"], ["sh", "శ"], ["Sh", "ష"],
  ["k", "క"], ["g", "గ"], ["c", "చ"], ["j", "జ"], ["z", "జ"],
  ["T", "ట"], ["D", "డ"], ["N", "ణ"], ["t", "త"], ["d", "ద"], ["n", "న"],
  ["p", "ప"], ["f", "ఫ"], ["b", "బ"], ["m", "మ"],
  ["y", "య"], ["r", "ర"], ["R", "ర"], ["l", "ల"], ["L", "ళ"],
  ["v", "వ"], ["w", "వ"], ["s", "స"], ["h", "హ"], ["x", "క్ష"], ["q", "క"],
]

type Token =
  | { kind: "vowel"; roman: string; letter: string; sign: string }
  | { kind: "consonant"; roman: string; letter: string }
  | { kind: "mark"; roman: string; letter: string }

const TOKENS: Token[] = [
  ...VOWELS.map(([roman, letter, sign]) => ({ kind: "vowel" as const, roman, letter, sign })),
  ...CONSONANTS.map(([roman, letter]) => ({ kind: "consonant" as const, roman, letter })),
  { kind: "mark" as const, roman: "M", letter: ANUSVARA },
  { kind: "mark" as const, roman: "H", letter: "ః" },
].sort((a, b) => b.roman.length - a.roman.length) // longest match first

// n/m before these stay a real consonant (kanya -> కన్య), others become ం.
const KEEP_NASAL_BEFORE = new Set(["y", "r", "R", "l", "L", "v", "w", "h"])

function convert(word: string): string {
  let out = ""
  let open: Token | undefined // last consonant still waiting for a vowel

  for (let i = 0; i < word.length; ) {
    const token = TOKENS.find((t) => word.startsWith(t.roman, i))
    if (!token) {
      if (open) out += VIRAMA
      out += word[i]
      open = undefined
      i++
      continue
    }
    i += token.roman.length

    if (token.kind === "consonant") {
      if (open) {
        const nasal = open.roman === "n" || open.roman === "m"
        if (nasal && open.roman !== token.roman && !KEEP_NASAL_BEFORE.has(token.roman)) {
          // manchi -> మంచి, pantalu -> పంటలు (but amma -> అమ్మ)
          out = out.slice(0, -open.letter.length) + ANUSVARA
        } else {
          out += VIRAMA // conjunct: mirchi -> మిర్చి
        }
      }
      out += token.letter
      open = token
    } else {
      out += token.kind === "vowel" && open ? token.sign : token.letter
      open = undefined
    }
  }

  if (open) {
    // Final m after a vowel sound -> ం (kaaram -> కారం, vyavasaayam -> వ్యవసాయం);
    // any other final consonant keeps a virama (mirch -> మిర్చ్).
    const rest = out.slice(0, -open.letter.length)
    out =
      open.roman === "m" && /[ా-ౌ]$|[అ-ఔ]$|[క-హ]$/.test(rest)
        ? rest + ANUSVARA
        : out + VIRAMA
  }
  return out
}

// Common farm words in the loose spellings farmers type (rules need T/D/N for ట/డ/ణ).
const WORDS: Record<string, string> = {
  panta: "పంట", pantalu: "పంటలు", pantaku: "పంటకు", pantalo: "పంటలో",
  nivarana: "నివారణ", nivaarana: "నివారణ", mirapa: "మిరప", mirchi: "మిర్చి",
  patti: "పత్తి", pathi: "పత్తి", vari: "వరి", mokka: "మొక్క", mokkalu: "మొక్కలు",
  aaku: "ఆకు", aakulu: "ఆకులు", akulu: "ఆకులు", tegulu: "తెగులు",
  purugu: "పురుగు", purugulu: "పురుగులు", mandu: "మందు", mandulu: "మందులు",
  eruvu: "ఎరువు", eruvulu: "ఎరువులు", neeru: "నీరు", vepa: "వేప",
  tamara: "తామర", thamara: "తామర", ela: "ఎలా", emiti: "ఏమిటి", emi: "ఏమి",
  enduku: "ఎందుకు", cheyali: "చేయాలి", karanam: "కారణం", kaaranam: "కారణం",
  parishkaram: "పరిష్కారం", samasya: "సమస్య", ledu: "లేదు", undi: "ఉంది",
  pichikari: "పిచికారి", vittanam: "విత్తనం", vittanalu: "విత్తనాలు",
}

export const CURATED_WORDS = Object.values(WORDS)

// Real Telugu words -> frequency rank (0 = most common), from public/telugu-words.txt.
export type Lexicon = Map<string, number>

// Loose spellings a farmer may mean, most likely first.
const CONSONANT_ALTS: Record<string, string[]> = {
  t: ["t", "T", "th"], T: ["T", "t"], th: ["th", "t", "T", "Th"],
  d: ["d", "D", "dh"], D: ["D", "d"], dh: ["dh", "d", "D"],
  n: ["n", "N"], N: ["N", "n"], l: ["l", "L"], L: ["L", "l"],
  s: ["s", "sh", "Sh"], sh: ["sh", "Sh", "s"], Sh: ["Sh", "sh"],
  ch: ["ch", "Ch"], c: ["ch"], k: ["k", "kh"], g: ["g", "gh"],
  p: ["p", "ph"], b: ["b", "bh"],
}
const VOWEL_ALTS: Record<string, string[]> = {
  a: ["a", "aa"], i: ["i", "ii"], u: ["u", "uu"], e: ["e", "E"], o: ["o", "O"],
}
const MAX_VARIANTS = 2000

function tokenize(word: string): Token[] | null {
  const tokens: Token[] = []
  for (let i = 0; i < word.length; ) {
    const token = TOKENS.find((t) => word.startsWith(t.roman, i))
    if (!token) return null
    tokens.push(token)
    i += token.roman.length
  }
  return tokens
}

// Every spelling variant of the typed word (doubled consonants, long vowels, ట/డ/ణ…).
function variants(tokens: Token[]): string[] {
  const options = tokens.map((token, i) => {
    if (token.kind === "vowel") return VOWEL_ALTS[token.roman] ?? [token.roman]
    const alts = token.kind === "consonant" ? (CONSONANT_ALTS[token.roman] ?? [token.roman]) : [token.roman]
    // Between two vowels a consonant is often doubled: vache -> vachche (వచ్చే).
    const between = tokens[i - 1]?.kind === "vowel" && tokens[i + 1]?.kind === "vowel"
    return between ? [...alts, ...alts.map((a) => a + a)] : alts
  })
  // Too many combinations: drop the least likely alternatives first.
  const count = () => options.reduce((n, o) => n * o.length, 1)
  while (count() > MAX_VARIANTS) {
    const widest = options.reduce((w, o, i) => (o.length > options[w].length ? i : w), 0)
    options[widest] = options[widest].slice(0, -1)
  }
  let out = [""]
  for (const choices of options) {
    out = out.flatMap((prefix) => choices.map((c) => prefix + c))
  }
  return out
}

// Skip ALL-CAPS (DAP, NPK), words with digits (5ml) and non-Latin text.
function normalize(word: string): string | null {
  if (!/[A-Za-z]/.test(word) || /\d/.test(word)) return null
  if (word.length > 1 && word === word.toUpperCase()) return null
  // Phone keyboards capitalise the first letter: "Mirchi" means "mirchi".
  return /^[A-Z][a-z]+$/.test(word) ? word.toLowerCase() : word
}

// Telugu words the farmer may mean, best first (curated, then real words by
// frequency, then the plain letter-by-letter spelling).
export function suggest(word: string, lexicon?: Lexicon, limit = 4): string[] {
  const typed = normalize(word)
  if (!typed) return []
  const found = new Set<string>()
  if (WORDS[typed]) found.add(WORDS[typed])
  const tokens = lexicon && tokenize(typed)
  if (tokens) {
    const real = variants(tokens)
      .map(convert)
      .filter((w) => lexicon.has(w))
      .sort((a, b) => lexicon.get(a)! - lexicon.get(b)!)
    for (const w of real) found.add(w)
  }
  found.add(convert(typed))
  return [...found].slice(0, limit)
}

// One word -> its best Telugu spelling (unchanged if it should stay English).
export function transliterateWord(word: string, lexicon?: Lexicon): string {
  return suggest(word, lexicon, 1)[0] ?? word
}

// Every English word in a text (used when sending).
export const transliterateText = (text: string, lexicon?: Lexicon) =>
  text.replace(/[A-Za-z0-9]+/g, (w) => transliterateWord(w, lexicon))

// After the user types a space / Enter / punctuation: convert the word before it.
export function convertLastWord(
  value: string,
  caret: number,
  lexicon?: Lexicon
): { value: string; caret: number } | null {
  const before = value.slice(0, caret)
  const match = before.match(/([A-Za-z0-9]+)([\s.,?!])$/)
  if (!match) return null
  const converted = transliterateWord(match[1], lexicon)
  if (converted === match[1]) return null
  const head = before.slice(0, before.length - match[0].length) + converted + match[2]
  return { value: head + value.slice(caret), caret: head.length }
}
