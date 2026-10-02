// Regenerates the PWA PNG icons from app/icon.svg: node scripts/pwa-icons.mjs
import { mkdir, readFile } from "node:fs/promises"
import sharp from "sharp"

const svg = await readFile("app/icon.svg")
await mkdir("public/icons", { recursive: true })

for (const [file, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(`public/icons/${file}`)
}

// Maskable: full-bleed green, sprout inside the 80% safe zone (no rounded corners).
const glyph = svg
  .toString()
  .replace(/<rect[^>]*\/>/, "")
  .replace('viewBox="0 0 512 512"', 'viewBox="-80 -80 672 672"')
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#2f8f4e"/>${glyph.replace("<svg", '<svg width="512" height="512"')}</svg>`
await sharp(Buffer.from(maskable), { density: 384 })
  .resize(512, 512)
  .png()
  .toFile("public/icons/maskable-512.png")
console.log("PWA icons written to public/icons/")
