import { db } from "./client"
import { getLatestOil } from "./oil"

const AVG_COLS: Record<number, string> = {
  0: "g0_jumbo_avg",
  1: "g1_xlarge_avg",
  2: "g2_large_avg",
  3: "g3_medium_avg",
  4: "g4_small_avg",
  5: "g5_petite_avg",
}

function parseGradeNum(grade: string | null): number | null {
  if (!grade) return null
  const m = grade.match(/(\d)/)
  const n = m ? parseInt(m[1]) : NaN
  return !isNaN(n) && n >= 0 && n <= 5 ? n : null
}

export async function saveSignal(
  userId: string,
  s: {
    action: string
    grade?: string
    quantity?: number
    confidence?: number
    context?: string
    price_at_signal?: number | null
    forecast_7d?: number | null
    forecast_14d?: number | null
    demand_shock?: string | null
    supply_shock?: string | null
  }
): Promise<void> {
  try {
    const oil = await getLatestOil()
    await db().from("agent_signals").insert({
      user_id: userId,
      action: s.action,
      grade: s.grade ?? null,
      quantity_rec: s.quantity ?? null,
      confidence: s.confidence ?? null,
      market_context: s.context ?? null,
      oil_price: (oil.hi_diesel as number) ?? null,
      price_at_signal: s.price_at_signal ?? null,
      forecast_7d: s.forecast_7d ?? null,
      forecast_14d: s.forecast_14d ?? null,
      demand_shock: s.demand_shock ?? null,
      supply_shock: s.supply_shock ?? null,
    })
  } catch (e) {
    console.error("saveSignal:", e)
  }
}

// Finds signals older than 7 days that have forecast_7d but no actual_price_7d,
// then looks up the real egg price on that target date to compute signal accuracy.
// Also fills actual_price_14d when the data is available.
export async function backfillSignalActuals(): Promise<{ filled: number }> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: signals, error } = await db()
      .from("agent_signals")
      .select("id, grade, created_at, forecast_7d, forecast_14d, actual_price_14d")
      .lt("created_at", cutoff)
      .not("forecast_7d", "is", null)
      .is("actual_price_7d", null)
      .limit(100)

    if (error || !signals?.length) return { filled: 0 }

    let filled = 0
    for (const sig of signals) {
      const gradeNum = parseGradeNum(sig.grade as string | null)
      if (gradeNum === null) continue

      const signalDate = new Date(sig.created_at as string)
      const avgCol = AVG_COLS[gradeNum]

      // Look up actual price at 7-day target
      const target7d = new Date(signalDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      const { data: rows7 } = await db()
        .from("egg_price_daily")
        .select(`date,${avgCol}`)
        .gte("date", target7d.toISOString().split("T")[0])
        .order("date", { ascending: true })
        .limit(1)

      const row7 = rows7?.[0] as Record<string, unknown> | undefined
      const actual7 = row7?.[avgCol] as number | null
      if (!actual7) continue

      const forecast7 = sig.forecast_7d as number
      const accuracy = forecast7 > 0
        ? Math.max(0, Math.round((1 - Math.abs(actual7 - forecast7) / forecast7) * 1000) / 10)
        : null

      const update: Record<string, unknown> = { actual_price_7d: actual7, signal_accuracy: accuracy }

      // Also fill actual_price_14d if not yet set and 14 days have passed
      const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      if (!sig.actual_price_14d && (sig.created_at as string) < cutoff14) {
        const target14 = new Date(signalDate.getTime() + 14 * 24 * 60 * 60 * 1000)
        const { data: rows14 } = await db()
          .from("egg_price_daily")
          .select(`date,${avgCol}`)
          .gte("date", target14.toISOString().split("T")[0])
          .order("date", { ascending: true })
          .limit(1)
        const row14 = rows14?.[0] as Record<string, unknown> | undefined
        const actual14 = row14?.[avgCol] as number | null
        if (actual14) update.actual_price_14d = actual14
      }

      await db().from("agent_signals").update(update).eq("id", sig.id)
      filled++
    }
    return { filled }
  } catch (e) {
    console.error("backfillSignalActuals:", e)
    return { filled: 0 }
  }
}

// Returns the mean forecast error (actual_price_7d − forecast_7d) across the last N
// filled signals for a given grade. Positive = forecasts were too LOW.
// Used by price-forecaster to apply a damped bias correction before caching.
export async function getRecentForecastBias(
  grade: number
): Promise<{ n: number; meanError: number }> {
  try {
    const { data, error } = await db()
      .from("agent_signals")
      .select("forecast_7d, actual_price_7d, grade")
      .not("forecast_7d", "is", null)
      .not("actual_price_7d", "is", null)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error || !data?.length) return { n: 0, meanError: 0 }

    const rows = data.filter((r) => parseGradeNum(r.grade as string | null) === grade)
    if (!rows.length) return { n: 0, meanError: 0 }

    const errors = rows
      .slice(0, 20)
      .map((r) => (r.actual_price_7d as number) - (r.forecast_7d as number))
    const meanError = errors.reduce((s, e) => s + e, 0) / errors.length
    return { n: errors.length, meanError }
  } catch (e) {
    console.error("getRecentForecastBias:", e)
    return { n: 0, meanError: 0 }
  }
}
