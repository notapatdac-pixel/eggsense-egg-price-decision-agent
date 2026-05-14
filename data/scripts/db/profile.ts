import type { Grade, UserProfile, AiProfile } from "@/lib/types"
import { db } from "./client"
import { getLatestEggPrice } from "./prices"

export async function ensureUser(userId: string, email?: string | null): Promise<void> {
  const { error } = await db()
    .from("users")
    .upsert(
      { user_id: userId, email: email ?? null, last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
  if (error) console.error("ensureUser error:", error.message, "code:", error.code, "details:", error.details)
}

export async function getUser(userId: string): Promise<UserProfile | null> {
  try {
    const { data } = await db().from("users").select("*").eq("user_id", userId).single()
    return (data ?? null) as UserProfile | null
  } catch {
    return null
  }
}

export async function getAiProfile(userId: string): Promise<AiProfile | null> {
  try {
    const { data } = await db().from("ai_user_profile").select("*").eq("user_id", userId).single()
    return (data ?? null) as AiProfile | null
  } catch {
    return null
  }
}

export function getOffset(profile: AiProfile | null, grade: Grade): number {
  if (!profile) return 0
  return parseFloat(String((profile as unknown as Record<string, unknown>)[`price_offset_g${grade}`] ?? 0)) || 0
}

export async function upsertAiProfile(userId: string, updates: Partial<AiProfile>): Promise<boolean> {
  try {
    for (let g = 0; g <= 5; g++) {
      const pk = `personal_price_g${g}` as keyof AiProfile
      if (updates[pk] != null) {
        const dit = await getLatestEggPrice(g as Grade)
        ;(updates as unknown as Record<string, unknown>)[`price_offset_g${g}`] =
          Math.round((parseFloat(String(updates[pk])) - dit) * 10000) / 10000
      }
    }
    const u = updates as Record<string, unknown>
    const fields = ["collected_business", "collected_grade", "collected_usage", "collected_price", "collected_supplier"]

    // Always fetch existing for merge: score + avg_monthly_spend both need full picture
    const existing = await getAiProfile(userId)
    const ex = (existing ?? {}) as Record<string, unknown>

    const totalTrue = fields.filter((f) => u[f] === true || ex[f] === true).length
    u.profile_score = totalTrue * 20

    // Recompute avg_monthly_spend whenever we have usage + at least one personal price
    const mergedUsage = (u.daily_egg_usage ?? ex.daily_egg_usage) as number | null | undefined
    if (mergedUsage) {
      const pricedGrades = [0, 1, 2, 3, 4, 5].filter((g) => {
        const pk = `personal_price_g${g}`
        return (u[pk] ?? ex[pk]) != null
      })
      if (pricedGrades.length > 0) {
        const avgPrice =
          pricedGrades.reduce((sum, g) => sum + parseFloat(String(u[`personal_price_g${g}`] ?? ex[`personal_price_g${g}`])), 0) /
          pricedGrades.length
        u.avg_monthly_spend = Math.round(avgPrice * Number(mergedUsage) * 30)
      }
    }
    const { error } = await db()
      .from("ai_user_profile")
      .upsert({ ...updates, user_id: userId }, { onConflict: "user_id" })
    if (error) throw error
    return true
  } catch (e) {
    console.error("upsertAiProfile:", e)
    return false
  }
}
