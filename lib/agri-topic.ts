// Cheap checks before calling the LLM: is this a proper farming question?
import { CROPS } from "@/lib/crops"

// Word stems: "పురుగు" also matches పురుగులు / పురుగుకు.
const TELUGU = [
  "పంట", "పొలం", "పొలాని", "సాగు", "విత్తు", "విత్తన", "నారు", "నాట్లు", "ఎరువు", "మందు",
  "పురుగు", "తెగులు", "తెగుళ్ళు", "ఆకు", "కాయ", "పూత", "పువ్వు", "పూలు", "వేరు", "వేర్లు",
  "కాండం", "కొమ్మ", "మొక్క", "చెట్టు", "తోట", "నేల", "భూమి", "మట్టి", "నీరు", "నీటి",
  "దిగుబడి", "కోత", "కలుపు", "పిచికారి", "సేంద్రీయ", "వ్యవసాయ", "రైతు", "గింజ", "ధాన్య",
  "పశు", "ఆవు", "గేదె", "కోళ్ళ", "కోడి", "చేప", "తేనె", "వర్షం", "వాతావరణ", "కంపోస్టు",
  // "ధర" / "మార్కెట్" alone are too general (cinema ticket price); crop names cover crop prices.
  "ఎలుక", "చెదలు", "కోతులు", "మోతాదు", "ఫంగస్", "వైరస్",
  // Spoken spellings that differ from the CROPS names.
  "పత్తి", "మిర్చి", "మిర్చ", "చెరుకు", "కొబ్బరి", "టమోటా", "టమాటో", "వంకాయ", "బెండ",
  "కూరగాయ", "పండ్ల", "నిమ్మ", "జామ", "బొప్పాయి", "పుచ్చ", "ఉల్లిపాయ", "వెల్లుల్లి",
  ...Object.values(CROPS),
]
const ENGLISH = [
  "crop", "farm", "field", "agri", "pest", "insect", "disease", "fung", "virus", "seed",
  "soil", "plant", "leaf", "leaves", "root", "flower", "fruit", "yield", "harvest", "spray",
  "fertili", "manure", "compost", "organic", "weed", "irrigat", "water", "cattle", "cow",
  "rice", "chili", "chilli", "cotton", "maize", "dose", "neem", "urea", "dap", "npk",
  ...Object.keys(CROPS).map((slug) => slug.replace(/-/g, " ")),
]

const GREETINGS =
  /^(హాయ్|హలో|నమస్కారం|నమస్తే|హాయ్ అండి|hi+|hello|hey|namaste|namaskaram|ok|okay|సరే|థాంక్స్|thanks?)[\s!.?]*$/i

export function looksAgricultural(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    TELUGU.some((stem) => text.includes(stem)) ||
    ENGLISH.some((word) => lower.includes(word))
  )
}

// Greetings, a single letter/word or gibberish without real letters.
export function isImproper(text: string): boolean {
  const trimmed = text.trim()
  if (GREETINGS.test(trimmed)) return true
  const letters = trimmed.match(/[ఀ-౿A-Za-z]/g)?.length ?? 0
  return letters < 3
}
