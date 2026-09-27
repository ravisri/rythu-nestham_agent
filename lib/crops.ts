// Crop slugs used in crop_knowledge.metadata.crop (ingest manifests + search filter).
// "general" = advice that applies to all crops (soil, organic farming, biocontrol, ...).
export const CROPS = {
  general: "సాధారణ",
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
