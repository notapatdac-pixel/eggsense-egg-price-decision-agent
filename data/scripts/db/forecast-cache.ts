import type { Grade, ForecastPoint } from "@/lib/types"
import { db, today } from "./client"

// Bump this when model parameters change significantly — invalidates today's cached forecasts.
const MODEL_VERSION = "2"

type CacheEnvelope = { v: string; pts: ForecastPoint[] }

export async function getCachedForecast(grade: Grade): Promise<ForecastPoint[] | null> {
  try {
    const { data } = await db()
      .from("forecast_cache")
      .select("forecast_json")
      .eq("grade", grade)
      .eq("forecast_date", today())
      .order("computed_at", { ascending: false })
      .limit(1)
    const row = data?.[0]
    if (!row) return null
    const raw = row.forecast_json as unknown
    // Old cache entries are plain arrays — ignore them so the new model runs.
    if (Array.isArray(raw)) return null
    const env = raw as CacheEnvelope
    if (env.v !== MODEL_VERSION) return null
    return env.pts
  } catch {
    return null
  }
}

export async function saveForecastCache(
  grade: Grade,
  forecast: ForecastPoint[],
  signal?: string,
  confidence?: number
): Promise<void> {
  try {
    const dateStr = today()
    // No unique constraint exists on (grade, forecast_date) in the real schema,
    // so we delete the existing entry for today then insert fresh.
    await db()
      .from("forecast_cache")
      .delete()
      .eq("grade", grade)
      .eq("forecast_date", dateStr)

    await db().from("forecast_cache").insert({
      grade,
      forecast_date: dateStr,
      forecast_json: { v: MODEL_VERSION, pts: forecast } as CacheEnvelope,
      signal: signal ?? null,
      signal_confidence: confidence ?? null,
    })
  } catch (e) {
    console.error("saveForecastCache:", e)
  }
}
