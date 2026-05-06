import { createClient as supabaseClient } from "@supabase/supabase-js"
import type {
  Grade,
  GradePrice,
  PricePoint,
  OilPoint,
  ForecastPoint,
  UserProfile,
  AiProfile,
  ChatMessage,
  NewsItem,
  ContextFactors,
} from "./types"
import { GRADE_NAMES, FALLBACK } from "./types"

// -- Column maps ------------------------------------------------
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

// -- Service client (server-side only, bypasses RLS) ----------
export const db = () =>
  supabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

const today = () => new Date().toISOString().split("T")[0]
const ago = (d: number) => {
  const dt = new Date()
  dt.setDate(dt.getDate() - d)
  return dt.toISOString().split("T")[0]
}

// -- EGG PRICES ------------------------------------------------

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

// -- OIL PRICES ------------------------------------------------

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

// -- USER + AI PROFILE -----------------------------------------

// Ensures a row exists in public.users so FK constraints on ai_conversations etc. don't fail
export async function ensureUser(userId: string, email?: string | null): Promise<void> {
  try {
    await db()
      .from("users")
      .upsert({ user_id: userId, email: email ?? null }, { onConflict: "user_id" })
  } catch (e) {
    console.error("ensureUser:", e)
  }
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
    // Auto-compute price offsets when personal prices are set
    for (let g = 0; g <= 5; g++) {
      const pk = `personal_price_g${g}` as keyof AiProfile
      if (updates[pk] != null) {
        const dit = await getLatestEggPrice(g as Grade)
        ;(updates as unknown as Record<string, unknown>)[`price_offset_g${g}`] =
          Math.round((parseFloat(String(updates[pk])) - dit) * 10000) / 10000
      }
    }
    // Auto-calculate profile_score (20 pts per collected field, max 100)
    const u = updates as Record<string, unknown>
    const fields = ["collected_business", "collected_grade", "collected_usage", "collected_price", "collected_supplier"]
    const newlyTrue = fields.filter((f) => u[f] === true).length
    if (newlyTrue > 0) {
      const existing = await getAiProfile(userId)
      const ex = (existing ?? {}) as Record<string, unknown>
      const totalTrue = fields.filter((f) => u[f] === true || ex[f] === true).length
      u.profile_score = totalTrue * 20
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

// -- CONVERSATIONS ---------------------------------------------

export async function loadHistory(userId: string, limit = 20): Promise<ChatMessage[]> {
  try {
    const { data } = await db()
      .from("ai_conversations")
      .select("role,content,metadata,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(limit)
    if (!data) return []
    return data.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content as string,
      metadata: r.metadata as Record<string, unknown> | null,
      timestamp: (r.created_at as string)?.slice(11, 16),
    }))
  } catch {
    return []
  }
}

export async function saveMsg(
  userId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  try {
    await db()
      .from("ai_conversations")
      .insert({ user_id: userId, role, content, metadata: metadata ?? null })
  } catch (e) {
    console.error("saveMsg:", e)
  }
}

// -- SIGNALS ---------------------------------------------------

export async function saveSignal(
  userId: string,
  s: { action: string; grade?: string; quantity?: number; confidence?: number; context?: string }
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
    })
  } catch (e) {
    console.error("saveSignal:", e)
  }
}

// -- NEWS CACHE ------------------------------------------------

export async function getCachedNews(queryKey: string, limit = 8): Promise<NewsItem[]> {
  try {
    const { data } = await db()
      .from("news_cache")
      .select("*")
      .eq("query_key", queryKey)
      .gt("expires_at", new Date().toISOString())
      .order("fetched_at", { ascending: false })
      .limit(limit)
    return (data ?? []) as unknown as NewsItem[]
  } catch {
    return []
  }
}

export async function saveNewsCache(queryKey: string, articles: Partial<NewsItem>[]): Promise<void> {
  try {
    await db().from("news_cache").delete().eq("query_key", queryKey)
    if (articles.length) await db().from("news_cache").insert(articles.map((a) => ({ ...a, query_key: queryKey })))
  } catch (e) {
    console.error("saveNewsCache:", e)
  }
}

// -- FORECAST CACHE --------------------------------------------

export async function getCachedForecast(grade: Grade): Promise<ForecastPoint[] | null> {
  try {
    const { data } = await db().from("forecast_cache").select("forecast_json").eq("grade", grade).eq("forecast_date", today()).single()
    return data ? (data.forecast_json as unknown as ForecastPoint[]) : null
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
    await db().from("forecast_cache").upsert(
      {
        grade,
        forecast_date: today(),
        forecast_json: forecast,
        signal: signal ?? null,
        signal_confidence: confidence ?? null,
      },
      { onConflict: "grade,forecast_date" }
    )
  } catch (e) {
    console.error("saveForecastCache:", e)
  }
}

// -- CRON LOG --------------------------------------------------

export async function logCron(
  job: string,
  status: "success" | "failed" | "partial",
  ms: number,
  rows = 0,
  err?: string
): Promise<void> {
  try {
    await db().from("cron_log").insert({
      job_name: job,
      status,
      duration_ms: ms,
      rows_inserted: rows,
      error_msg: err ?? null,
    })
  } catch {}
}

// -- PRICE ALERTS ----------------------------------------------

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

// -- FALLBACKS -------------------------------------------------

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
