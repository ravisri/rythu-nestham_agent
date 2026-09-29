// Stable per-browser id: lets "forgot password" skip the recovery code on a
// phone that has signed in to the account before.
const KEY = "rn_device"

export function getDeviceId(): string | undefined {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return undefined
  }
}
