import type { Grade } from "@/lib/types"
import { db, today } from "./client"
import { getLatestEggPrice } from "./prices"

export async function checkAlerts(
  userId: string
): Promise<Array<{ grade: string; alert_type: string; threshold_thb: number; current_price: number }>> {
  try {
    const { data } = await db().from("price_alerts").select("*").eq("user_id", userId).eq("is_active", true)
    if (!data?.length) return []
    const triggered = []
    for (const alert of data) {
      const g = parseInt(alert.grade.replace("G", "")) as Grade
      const cp = await getLatestEggPrice(g)
      const hit =
        (alert.alert_type === "ABOVE" && cp >= alert.threshold_thb) ||
        (alert.alert_type === "BELOW" && cp <= alert.threshold_thb)
      if (hit) {
        triggered.push({ ...alert, current_price: cp })
        await db().from("price_alerts").update({ last_triggered: today() }).eq("id", alert.id)
      }
    }
    return triggered
  } catch {
    return []
  }
}

export async function getAlerts(
  userId: string
): Promise<Array<{ id: number; grade: string; alert_type: string; threshold_thb: number; is_active: boolean; last_triggered: string | null; created_at: string }>> {
  try {
    const { data, error } = await db()
      .from("price_alerts")
      .select("id, grade, alert_type, threshold_thb, is_active, last_triggered, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []) as typeof data extends null ? [] : NonNullable<typeof data>
  } catch {
    return []
  }
}

export async function createAlert(
  userId: string,
  grade: string,
  alertType: "ABOVE" | "BELOW",
  thresholdThb: number
): Promise<{ id: number } | null> {
  try {
    const { data, error } = await db()
      .from("price_alerts")
      .insert({ user_id: userId, grade, alert_type: alertType, threshold_thb: thresholdThb })
      .select("id")
      .single()
    if (error) throw error
    return data as { id: number }
  } catch (e) {
    console.error("createAlert:", e)
    return null
  }
}

export async function deleteAlert(userId: string, alertId: number): Promise<boolean> {
  try {
    const { error } = await db()
      .from("price_alerts")
      .delete()
      .eq("id", alertId)
      .eq("user_id", userId)  // ensures users can only delete their own alerts
    if (error) throw error
    return true
  } catch (e) {
    console.error("deleteAlert:", e)
    return false
  }
}

export async function toggleAlert(userId: string, alertId: number, isActive: boolean): Promise<boolean> {
  try {
    const { error } = await db()
      .from("price_alerts")
      .update({ is_active: isActive })
      .eq("id", alertId)
      .eq("user_id", userId)
    if (error) throw error
    return true
  } catch (e) {
    console.error("toggleAlert:", e)
    return false
  }
}
