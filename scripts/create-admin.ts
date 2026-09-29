// Usage: npm run create-admin <username> <password> [phone]
// Creates an admin account, or promotes an existing user to admin and sets
// the given password. Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import { findUser, hashSecret, newRecoveryCode } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase"
import { adminCreateSchema } from "@/lib/validation"

async function main() {
  const [username, password, phone = ""] = process.argv.slice(2)
  const parsed = adminCreateSchema.safeParse({
    username: username ?? "",
    password: password ?? "",
    phone,
    plan: "pro_plus",
  })
  if (!parsed.success) {
    console.error("Usage: npm run create-admin <username> <password> [phone]")
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`)
    }
    process.exit(1)
  }

  const values = parsed.data
  const db = getSupabase()
  const existing = await findUser(values.username)

  if (existing) {
    const { error } = await db
      .from("app_users")
      .update({
        role: "admin",
        password_hash: await hashSecret(values.password),
        failed_logins: 0,
        locked_until: null,
      })
      .eq("id", existing.id)
    if (error) throw error
    console.log(`"${values.username}" is now an admin. Password updated.`)
    return
  }

  const recoveryCode = newRecoveryCode()
  const { error } = await db.from("app_users").insert({
    username: values.username,
    phone: values.phone || null,
    role: "admin",
    plan: values.plan,
    password_hash: await hashSecret(values.password),
    recovery_code_hash: await hashSecret(recoveryCode),
  })
  if (error?.code === "23505") {
    throw new Error("This phone number already belongs to another account.")
  }
  if (error) throw error
  console.log(`Admin "${values.username}" created.`)
  console.log(`Recovery code (keep it safe): ${recoveryCode}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
