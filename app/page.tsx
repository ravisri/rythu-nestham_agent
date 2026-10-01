import { redirect } from "next/navigation"
import { Chat } from "@/components/chat/chat"
import { getCurrentUser } from "@/lib/auth"
import { usageSummary } from "@/lib/usage"

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  return (
    <Chat
      userId={user.id}
      username={user.username}
      isAdmin={user.role === "admin"}
      usage={await usageSummary(user)}
    />
  )
}
