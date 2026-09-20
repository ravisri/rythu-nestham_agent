// Seeded from India's CIB&RC banned list (27 long-banned actives + 2023 notification
// on monocrotophos/dicofol/dinocap/methomyl + endosulfan per Supreme Court order).
// Deliberately over-inclusive: blocking an allowed name only omits advice. Re-verify
// against the latest CIB&RC/Gazette notifications periodically.
export const BANNED_PESTICIDES = [
  "aldrin",
  "benzene hexachloride",
  "bhc",
  "calcium cyanide",
  "chlordane",
  "copper acetoarsenite",
  "dibromochloropropane",
  "endrin",
  "ethyl mercury chloride",
  "ethyl parathion",
  "heptachlor",
  "menazon",
  "nitrofen",
  "paraquat dimethyl sulphate",
  "pentachloro nitrobenzene",
  "pentachlorophenol",
  "phenyl mercury acetate",
  "sodium methane arsonate",
  "tetradifon",
  "toxaphene",
  "toxafen",
  "aldicarb",
  "chlorobenzilate",
  "dieldrin",
  "maleic hydrazide",
  "ethylene dibromide",
  "trichloroacetic acid",
  "metoxuron",
  "chlorfenvinphos",
  "monocrotophos",
  "dicofol",
  "dinocap",
  "methomyl",
  "endosulfan",
] as const

const BANNED_REGEX = new RegExp(`\\b(${BANNED_PESTICIDES.join("|")})\\b`, "i")

export const BANNED_PROMPT_LIST = BANNED_PESTICIDES.join(", ")

export function mentionsBanned(text: string): boolean {
  return BANNED_REGEX.test(text)
}

// Drops any sentence that names a banned active; keeps the rest of the chunk.
export function redactBanned(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !mentionsBanned(sentence))
    .join(" ")
}
