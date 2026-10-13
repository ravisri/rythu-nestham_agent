// Runs in the browser. Tells the top progress bar (components/route-progress.tsx)
// the moment any App Router navigation starts: links, router.push/replace,
// back/forward.
export function onRouterTransitionStart(url: string) {
  const target = new URL(url, window.location.href)
  const current = window.location
  if (target.pathname === current.pathname && target.search === current.search) {
    return // same page (e.g. a hash change): nothing will load
  }
  window.dispatchEvent(new CustomEvent("rn:navigate"))
}
