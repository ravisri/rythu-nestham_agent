// Crop slugs used in crop_knowledge.metadata.crop (ingest manifests + search filter).
// "general" = advice that applies to all crops (soil, organic farming, biocontrol, ...).
export const CROPS = {
  general: "సాధారణ",
  organic: "సేంద్రీయ", // organic inputs for all crops (data/pdfs/organic)
  paddy: "వరి",
  maize: "మొక్కజొన్న",
  sorghum: "జొన్న",
  "pearl-millet": "సజ్జ",
  "finger-millet": "రాగి",
  "foxtail-millet": "కొర్ర",
  "little-millet": "సామ",
  redgram: "కంది",
  greengram: "పెసర",
  blackgram: "మినుము",
  bengalgram: "శనగ",
  soybean: "సోయాచిక్కుడు",
  horsegram: "ఉలవలు",
  pulses: "అపరాలు",
  groundnut: "వేరుశనగ",
  sesame: "నువ్వులు",
  sunflower: "ప్రొద్దుతిరుగుడు",
  castor: "ఆముదం",
  niger: "వలిశెలు",
  oilseeds: "నూనె గింజలు",
  sugarcane: "చెరకు",
  cotton: "ప్రత్తి",
  roselle: "గోగు",
  trees: "కలప వృక్షాలు",
  chilli: "మిరప",
  turmeric: "పసుపు",
  tomato: "టమాట",
  onion: "ఉల్లి",
  banana: "అరటి",
  mango: "మామిడి",
} as const

export type Crop = keyof typeof CROPS

const ALIASES: Record<string, Crop> = {
  rice: "paddy",
  jowar: "sorghum",
  bajra: "pearl-millet",
  ragi: "finger-millet",
  pigeonpea: "redgram",
  tur: "redgram",
  moong: "greengram",
  urad: "blackgram",
  chickpea: "bengalgram",
  gram: "bengalgram",
  sesamum: "sesame",
  gingelly: "sesame",
  chili: "chilli",
  pepper: "chilli",
}

export function isCrop(value: string): value is Crop {
  return Object.hasOwn(CROPS, value)
}

// Free-text crop name from the model ("Rice", "red gram") -> slug, or undefined.
export function toCrop(name: string | undefined): Crop | undefined {
  if (!name) return undefined
  const key = name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "")
  const slug = Object.keys(CROPS).find((c) => c.replace(/-/g, "") === key)
  return (slug as Crop | undefined) ?? ALIASES[key]
}

// Group slugs: never picked from a question (too broad to filter on).
const GROUPS = new Set<Crop>([
  "general",
  "organic",
  "pulses",
  "oilseeds",
  "trees",
])

// Common spellings farmers use beside the CROPS names.
const TELUGU_ALIASES: Record<string, Crop> = {
  పత్తి: "cotton",
  మిర్చి: "chilli",
  మిరప: "chilli",
  టమాటో: "tomato",
  టొమాటో: "tomato",
  కందు: "redgram",
  పెసలు: "greengram",
  పెసర్లు: "greengram",
  మినుములు: "blackgram",
  మక్క: "maize",
  చెరుకు: "sugarcane",
  పొద్దుతిరుగుడు: "sunflower",
  సోయా: "soybean",
}

// Longest first, so వేరుశనగ wins over శనగ and మొక్కజొన్న over జొన్న.
const STEMS = [
  ...Object.entries(CROPS)
    .filter(([slug]) => !GROUPS.has(slug as Crop))
    .map(([slug, te]) => [te, slug as Crop] as const),
  ...Object.entries(TELUGU_ALIASES),
].sort((a, b) => b[0].length - a[0].length)

// The one crop a Telugu question is about, or undefined (none / several).
// Stems match only at a word start, so "ఫిబ్రవరి" is not వరి.
export function cropFromText(text: string): Crop | undefined {
  let rest = ` ${text}`
  const found = new Set<Crop>()
  for (const [stem, crop] of STEMS) {
    const re = new RegExp(`(^|[^\u0C00-\u0C7F])${stem}`, "g")
    if (re.test(rest)) {
      found.add(crop)
      rest = rest.replace(re, "$1 ") // a shorter stem can't match it again
    }
  }
  return found.size === 1 ? [...found][0] : undefined
}
