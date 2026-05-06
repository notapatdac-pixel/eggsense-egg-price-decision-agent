import { NextRequest, NextResponse } from "next/server"
import { upsertEggRow, logCron } from "@/lib/db"
export const runtime = "nodejs"

function auth(req: NextRequest) {
  const h = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  return h === process.env.CRON_SECRET
}
function classifyTemp(t: number) {
  if (t >= 38) return "Extreme Heat"
  if (t >= 35) return "Hot"
  if (t >= 30) return "Warm"
  if (t >= 25) return "Normal"
  if (t >= 20) return "Cool"
  return "Cold"
}

export async function GET(req: NextRequest) {
  return handler(req)
}
export async function POST(req: NextRequest) {
  return handler(req)
}
async function handler(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const t = Date.now()
  try {
    const resp = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=13.7563&longitude=100.5018&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia/Bangkok&forecast_days=1",
      { signal: AbortSignal.timeout(10000) }
    )
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = (await resp.json()) as {
      daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[] }
    }
    const d = data.daily
    const today = d.time[0]
    const tAvg = Math.round(((d.temperature_2m_max[0] + d.temperature_2m_min[0]) / 2) * 10) / 10
    const wCode = d.weathercode[0]
    const tempCat = classifyTemp(tAvg)
    const supplyShock = wCode >= 80 ? `Weather: ${wCode >= 95 ? "Thunderstorm" : "Heavy Rain"}` : null
    await upsertEggRow({ date: today, avg_temp_celsius: tAvg, temp_category: tempCat, ...(supplyShock && { supply_shock: supplyShock }) })
    await logCron("fetch-weather-daily", "success", Date.now() - t, 1)
    return NextResponse.json({ status: "ok", date: today, avg_temp: tAvg, temp_category: tempCat })
  } catch (e) {
    await logCron("fetch-weather-daily", "failed", Date.now() - t, 0, String(e))
    return NextResponse.json({ status: "failed", error: String(e) }, { status: 500 })
  }
}
