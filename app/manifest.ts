import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "రైతు నేస్తం",
    short_name: "రైతు నేస్తం",
    description: "పంట సమస్యలకు తెలుగులో సులభ పరిష్కారాలు",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf3",
    theme_color: "#2f8f4e",
    lang: "te",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  }
}
