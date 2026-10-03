import { redirect } from "next/navigation"
import { Chat } from "@/components/chat/chat"
import { getCurrentUser, getGuestId, hasSessionCookie } from "@/lib/auth"
import { guestLeft } from "@/lib/guest"
import { usageSummary } from "@/lib/usage"
import { getUserGoogleKey } from "@/lib/user-keys"

export default async function Page() {
  const user = await getCurrentUser()

  if (!user) {
    // Signed in on another phone: back to login (not a guest).
    if (await hasSessionCookie()) redirect("/login")
    // Guest: a few free questions a day before signing up.
    return (
      <Chat
        guest
        userId="guest"
        username=""
        isAdmin={false}
        usage={{
          plan: "trial",
          left: await guestLeft(await getGuestId()),
          status: "active",
        }}
      />
    )
  }

  return (
    <Chat
      userId={user.id}
      username={user.username}
      isAdmin={user.role === "admin"}
      usage={await usageSummary(user)}
      hasOwnKey={!!(await getUserGoogleKey(user.id))}
    />
  )
}
