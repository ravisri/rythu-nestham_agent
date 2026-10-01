import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

// Encrypts admin-entered API keys before they are stored in Supabase.
// The key is derived from AI_SETTINGS_SECRET, else SUPABASE_SERVICE_ROLE_KEY, so
// no new env var is needed. Rotating that secret makes saved keys unreadable:
// the app then falls back to .env keys until the admin enters them again.

function key(): Buffer {
  const secret =
    process.env.AI_SETTINGS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("No secret to encrypt AI settings with")
  return Buffer.from(hkdfSync("sha256", secret, "", "rythu-ai-settings-v1", 32))
}

const b64 = (b: Buffer) => b.toString("base64url")

// -> "v1.<iv>.<tag>.<ciphertext>"
export function encrypt(text: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  return ["v1", b64(iv), b64(cipher.getAuthTag()), b64(data)].join(".")
}

// Undefined when the value is malformed or was made with another secret.
export function decrypt(blob: string): string | undefined {
  try {
    const [version, iv, tag, data] = blob.split(".")
    if (version !== "v1" || !iv || !tag || !data) return undefined
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(iv, "base64url")
    )
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return undefined
  }
}

// Only the last 4 characters ever reach the browser.
export const mask = (value: string) => `••••${value.slice(-4)}`
