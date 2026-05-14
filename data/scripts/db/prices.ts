import type { Grade, GradePrice, PricePoint, FeaturePoint, ContextFactors } from "@/lib/types"
import { GRADE_NAMES, FALLBACK } from "@/lib/types"
import { db, ago } from "./client"

const AVG: Record<Grade, string> = {
  0: "g0_jumbo_avg",
  1: "g1_xlarge_avg",
  2: "g2_large_avg",
  3: "g3_medium_avg",
  4: "g4_small_avg",
  5: "g5_petite_avg",
}
const MIN: Record<Grade, string> = {
  0: "g0_jumbo_min",
  1: "g1_xlarge_min",
  2: "g2_large_min",
  3: "g3_medium_min",
  4: "g4_small_min",
  5: "g5_petite_min",
}
const MAX: Record<Grade, string> = {
  0: "g0_jumbo_max",
  1: "g1_xlarge_max",
  2: "g2_large_max",
  3: "g3_medium_max",
  4: "g4_small_max",
  5: "g5_petite_max",
}

export async function getAllGradesLatest(): Promise<GradePrice[]> {
  try {
    const { data } = await db().from("egg_price_daily").select("*").order("date", { ascending: false }).limit(2)
    if (!data?.length) return fallbackGrades()
    const [t, y] = [data[0], data[1] ?? data[0]]
    return Promise.all(
      ([0, 1, 2, 3, 4, 5] as Grade[]).map(async (g) => {
        const tp = (t[AVG[g]] as number) ?? FALLBACK[g]
        const yp = (y[AVG[g]] as number) ?? tp
        const h = await getEggHistory(g, 7)
        return {
          grade: g,
          name: GRADE_NAMES[g],
          avg: tp,
          min: (t[MIN[g]] as number | null) ?? null,
          max: (t[MAX[g]] as number | null) ?? null,
          changePct: yp ? Math.round(((tp - yp) / yp) * 1000) / 10 : 0,
          history7d: h.map((p) => p.price),
        }
      })
    )
  } catch (e) {
    console.error("getAllGradesLatest:", e)
    return fallbackGrades()
  }
}

export async function getEggHistory(grade: Grade, days = 60): Promise<PricePoint[]> {
  try {
    const { data } = await db()
      .from("egg_price_daily")
      .select("*")
      .gte("date", ago(days))
      .order("date", { ascending: true })
    if (!data?.length) return []
    return data.map((r) => {
      const row = r as Record<string, unknown>
      return {
        date: row.date as string,
        price: (row[AVG[grade]] as number) ?? 0,
        min: (row[MIN[grade]] as number | null) ?? null,
        max: (row[MAX[grade]] as number | null) ?? null,
        diesel: (row.diesel_price_thb as number | null) ?? null,
      }
    })
  } catch (e) {
    console.error("getEggHistory:", e)
    return []
  }
}

export async function getFeatureHistory(grade: Grade, days = 90): Promise<FeaturePoint[]> {
  try {
    const { data } = await db()
      .from("egg_price_daily")
      .select(`date,${AVG[grade]},avg_egg_price,diesel_price_thb,corn_price_thb,soybean_meal_price_thb,avg_temp_celsius,disease_status,disease_supply_impact`)
      .gte("date", ago(days))
      .order("date", { ascending: true })
    if (!data?.length) return []
    return data.map((r) => {
      const row = r as unknown as Record<string, unknown>
      return {
        date:           row.date as string,
        price:          (row[AVG[grade]] as number) ?? 0,
        avgPrice:       (row.avg_egg_price as number | null) ?? null,
        diesel:         (row.diesel_price_thb as number | null) ?? null,
        corn:           (row.corn_price_thb as number | null) ?? null,
        soybean:        (row.soybean_meal_price_thb as number | null) ?? null,
        temp:           (row.avg_temp_celsius as number | null) ?? null,
        disease_status: (row.disease_status as string | null) ?? null,
        disease_impact: (row.disease_supply_impact as string | null) ?? null,
      }
    })
  } catch (e) {
    console.error("getFeatureHistory:", e)
    return []
  }
}

export async function getLatestEggPrice(grade: Grade): Promise<number> {
  try {
    const { data } = await db().from("egg_price_daily").select("*").order("date", { ascending: false }).limit(1)
    return ((data?.[0] as Record<string, unknown> | undefined)?.[AVG[grade]] as number) ?? FALLBACK[grade]
  } catch {
    return FALLBACK[grade]
  }
}

export async function getContextFactors(): Promise<ContextFactors> {
  try {
    const { data } = await db()
      .from("egg_price_daily")
      .select(
        "date,avg_temp_celsius,temp_category,disease_status,disease_supply_impact,corn_price_thb,soybean_meal_price_thb,demand_shock,supply_shock,diesel_price_thb"
      )
      .order("date", { ascending: false })
      .limit(1)
    return (data?.[0] ?? {}) as ContextFactors
  } catch {
    return {}
  }
}

export async function upsertEggRow(row: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await db().from("egg_price_daily").upsert(row, { onConflict: "date" })
    if (error) throw error
    return true
  } catch (e) {
    console.error("upsertEggRow:", e)
    return false
  }
}

function fallbackGrades(): GradePrice[] {
  return ([0, 1, 2, 3, 4, 5] as Grade[]).map((g) => ({
    grade: g,
    name: GRADE_NAMES[g],
    avg: FALLBACK[g],
    min: FALLBACK[g] - 0.1,
    max: FALLBACK[g] + 0.1,
    changePct: 0,
    history7d: Array(7).fill(FALLBACK[g]),
  }))
}
