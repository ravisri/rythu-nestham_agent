// Rythu Nestham service worker: installable app + offline page.
// Chat (/api), Server Actions (POST), admin and other origins always go to the
// network and are never cached. The app registers /sw.js?v=<build id>, so every
// deploy gets a new cache and "activate" deletes the previous build's files.
const VERSION = new URL(self.location.href).searchParams.get("v") || "v1"
const CACHE = `rn-${VERSION}`
// Safety cap on cached static files (one build needs far fewer).
const MAX_STATIC = 60
const OFFLINE = "/offline.html"
const PRECACHE = [
  OFFLINE,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icon.svg",
]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting()
})

// Content-hashed / immutable files: safe to serve from cache.
const isStatic = (path) =>
  path.startsWith("/_next/static/") ||
  path.startsWith("/icons/") ||
  /\.(?:woff2?|ttf)$/.test(path)

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin"))
    return

  // Pages: always fresh from the network; offline -> friendly Telugu page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE).then((r) => r ?? Response.error())
      )
    )
    return
  }

  if (isStatic(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then(async (cache) => {
                await cache.put(request, copy)
                // Oldest build files first beyond the cap (icons/offline page stay).
                const keys = (await cache.keys()).filter((k) =>
                  new URL(k.url).pathname.startsWith("/_next/static/")
                )
                for (const old of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) {
                  await cache.delete(old)
                }
              })
            }
            return response
          })
      )
    )
  }
})
