// Downscale to keep LLM image tokens low and stay under Vercel's request-body limit.
export function compressImage(
  url: string,
  maxSide = 768,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("Canvas unavailable"))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL("image/jpeg", quality))
    }
    img.onerror = () => reject(new Error("Could not read image"))
    img.src = url
  })
}
