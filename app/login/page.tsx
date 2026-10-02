import { redirect } from "next/navigation"
import { AuthForm } from "@/components/auth/auth-form"
import { getCurrentUser } from "@/lib/auth"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  if (await getCurrentUser()) redirect("/")
  const { tab } = await searchParams
  return <AuthForm initialTab={tab === "signup" ? "signup" : "login"} />
}
