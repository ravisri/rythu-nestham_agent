import { redirect } from "next/navigation"
import { AuthForm } from "@/components/auth/auth-form"
import { getCurrentUser } from "@/lib/auth"

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/")
  return <AuthForm />
}
