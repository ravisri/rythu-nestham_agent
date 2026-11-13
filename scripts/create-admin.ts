// Usage: npm run create-admin <username> <password> [phone]
// Creates an admin account, or promotes an existing user to admin and sets
// the given password. Needs DATABASE_URL (Neon) in .env.local.
import { findUser, hashSecret, newRecoveryCode } from "@/lib/auth"
import { db, pgCode } from "@/lib/db"
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
  const existing = await findUser(values.username)

  if (existing) {
    await db()`
      update app_users set role = 'admin',
        password_hash = ${await hashSecret(values.password)},
        failed_logins = 0, locked_until = null
      where id = ${existing.id}::uuid`
    console.log(`"${values.username}" is now an admin. Password updated.`)
    return
  }

  const recoveryCode = newRecoveryCode()
  try {
    await db()`
      insert into app_users (username, phone, role, plan, password_hash, recovery_code_hash)
      values (${values.username}, ${values.phone || null}, 'admin', ${values.plan},
        ${await hashSecret(values.password)}, ${await hashSecret(recoveryCode)})`
  } catch (error) {
    if (pgCode(error) === "23505") {
      throw new Error("This phone number already belongs to another account.")
    }
    throw error
  }
  console.log(`Admin "${values.username}" created.`)
  console.log(`Recovery code (keep it safe): ${recoveryCode}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
