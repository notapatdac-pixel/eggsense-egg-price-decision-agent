import type { Grade, ForecastPoint } from "@/lib/types"
import { FALLBACK } from "@/lib/types"
import { getEggHistory, getOilHistory, getContextFactors, getCachedForecast, saveForecastCache } from "@/lib/db"

// Adjustment weights
const W = {
  oil: 0.25,
  tempHot: 0.02,
  tempCold: 0.01,
  cornBase: 11.0,
  soybeanBase: 17.0,
  cornFactor: 0.15,
  soybeanFactor: 0.1,
  diseaseActive: 0.08,
  diseaseContain: 0.03,
  demandShock: 0.05,
  supplyShock: -0.04,
  weekend: -0.015,
  weekday: 0.008,
}

const isoDate = (d: Date) => d.toISOString().split("T")[0]

export async function computeForecast(grade: Grade, daysAhead = 14, userOffset = 0): Promise<ForecastPoint[]> {
  // Cache-first (recomputed once per day, offset applied on retrieval)
  const cached = await getCachedForecast(grade)
  if (cached) return cached.map((p) => ({ ...p, price: Math.round((p.price + userOffset) * 10000) / 10000 }))

  const [history, oil, ctx] = await Promise.all([getEggHistory(grade, 60), getOilHistory(60), getContextFactors()])

  // Fallback: no data
  if (history.length < 7) {
    const base = FALLBACK[grade] + userOffset
    const t = new Date()
    return Array.from({ length: daysAhead }, (_, i) => ({
      date: isoDate(new Date(t.getFullYear(), t.getMonth(), t.getDate() + i + 1)),
      price: Math.round(base * (1 + 0.001 * i) * 10000) / 10000,
    }))
  }

  // Linear regression (least squares)
  const prices = history.map((h) => h.price)
  const n = prices.length
  const xs = Array.from({ length: n }, (_, i) => i)
  const sX = xs.reduce((a, b) => a + b, 0)
  const sY = prices.reduce((a, b) => a + b, 0)
  const sXY = xs.reduce((acc, x, i) => acc + x * prices[i], 0)
  const sX2 = xs.reduce((acc, x) => acc + x * x, 0)
  const slope = (n * sXY - sX * sY) / (n * sX2 - sX * sX)
  const intercept = (sY - slope * sX) / n

  // Oil correlation factor (last 14 days)
  let oilFactor = 0
  const diesels = oil.slice(-14).map((o) => o.diesel_price).filter(Boolean)
  if (diesels.length >= 7) {
    const oilChg = (diesels[diesels.length - 1] - diesels[0]) / diesels[0]
    oilFactor = oilChg * W.oil
  }

  // Temperature factor
  const tempAvg = ctx.avg_temp_celsius ?? 30
  const tempAdj = tempAvg > 35 ? W.tempHot * (tempAvg - 35) : tempAvg < 20 ? W.tempCold * (20 - tempAvg) : 0

  // Feed cost factors
  const cornAdj = ((ctx.corn_price_thb ?? W.cornBase) - W.cornBase) * W.cornFactor / 100
  const soybeanAdj = ((ctx.soybean_meal_price_thb ?? W.soybeanBase) - W.soybeanBase) * W.soybeanFactor / 100
  const feedAdj = cornAdj + soybeanAdj

  // Disease factor
  const ds = (ctx.disease_status ?? "none").toLowerCase()
  const diseaseAdj = ds.includes("active") ? W.diseaseActive : ds.includes("contain") ? W.diseaseContain : 0

  // Shock flags
  const shockAdj = (ctx.demand_shock ? W.demandShock : 0) + (ctx.supply_shock ? W.supplyShock : 0)

  const now = new Date()
  const forecast: ForecastPoint[] = []

  for (let i = 1; i <= daysAhead; i++) {
    const fd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const trend = intercept + slope * (n + i)
    const price =
      trend +
      oilFactor * (i / daysAhead) * trend +
      tempAdj * trend +
      feedAdj * trend +
      diseaseAdj * trend +
      shockAdj * trend +
      (fd.getDay() >= 6 ? W.weekend : W.weekday) * trend +
      userOffset
    forecast.push({ date: isoDate(fd), price: Math.max(Math.round(price * 10000) / 10000, 2.0) })
  }

  // Cache without user offset (applied on retrieval per-user)
  await saveForecastCache(grade, forecast.map((p) => ({ ...p, price: p.price - userOffset })))
  return forecast
}

export function generateSignal(forecast: ForecastPoint[], todayPrice: number) {
  if (!forecast.length || !todayPrice) return null
  const p7 = forecast[6]?.price ?? todayPrice
  const pct = ((p7 - todayPrice) / todayPrice) * 100
  if (pct > 4)
    return {
      action: "BUY NOW" as const,
      confidence: Math.min(95, Math.round(50 + pct * 5)),
      context: `Prices forecast +${pct.toFixed(1)}% in 7 days - buy at current rate.`,
    }
  if (pct < -3)
    return {
      action: "WAIT" as const,
      confidence: Math.min(90, Math.round(50 + Math.abs(pct) * 5)),
      context: `Prices forecast ${pct.toFixed(1)}% in 7 days - waiting saves money.`,
    }
  return {
    action: "HOLD" as const,
    confidence: 60,
    context: "Prices expected stable - normal purchasing cadence recommended.",
  }
}
