import type { OilPoint } from "@/lib/types"
import { db, ago } from "./client"

export async function getOilHistory(days = 60): Promise<OilPoint[]> {
  try {
    const { data } = await db()
      .from("bangchak_oil_prices")
      .select("price_date,hi_diesel,hi_premium_diesel")
      .gte("price_date", ago(days))
      .order("price_date", { ascending: true })
    if (!data?.length) return []
    return data.map((r) => ({
      date: r.price_date as string,
      diesel_price: ((r.hi_diesel ?? r.hi_premium_diesel) as number) ?? 30,
    }))
  } catch (e) {
    console.error("getOilHistory:", e)
    return []
  }
}

export async function getLatestOil(): Promise<Record<string, unknown>> {
  try {
    const { data } = await db().from("bangchak_oil_prices").select("*").order("price_date", { ascending: false }).limit(1)
    return (data?.[0] ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function upsertOilRow(row: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await db().from("bangchak_oil_prices").upsert(row, { onConflict: "price_date" })
    if (error) throw error
    return true
  } catch (e) {
    console.error("upsertOilRow:", e)
    return false
  }
}
