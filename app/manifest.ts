import type { MetadataRoute } from "next"

// Icons: public/icons (regenerate with `node scripts/pwa-icons.mjs`).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "రైతు నేస్తం",
    short_name: "రైతు నేస్తం",
    description: "పంట సమస్యలకు తెలుగులో సులభ పరిష్కారాలు",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7faf3",
    theme_color: "#2f8f4e",
    lang: "te",
    categories: ["agriculture", "education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      {
        name: "ప్రశ్న అడగండి",
        short_name: "ప్రశ్న",
        url: "/",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  }
}
