import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Changes every build: the service worker uses it as its cache name, so each
  // deploy drops the previous build's cached files (keeps the installed app small).
  env: { NEXT_PUBLIC_BUILD_ID: Date.now().toString(36) },
  // Service worker must never be cached, so app updates reach users quickly.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ]
  },
}

export default nextConfig
