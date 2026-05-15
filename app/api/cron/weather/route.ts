import { NextRequest, NextResponse } from "next/server"
import { upsertEggRow, logCron } from "@/lib/db"
import { cronAuth } from "../_auth"
export const runtime = "nodejs"

function classifyTemp(t: number) {
  if (t >= 38) return "Extreme Heat"
  if (t >= 35) return "Hot"
  if (t >= 30) return "Warm"
  if (t >= 25) return "Normal"
  if (t >= 20) return "Cool"
  return "Cold"
}

function ditDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }

async function handler(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const t = Date.now()
  const dataDate = ditDate()
  try {
    // Archive API returns actual observed data for a past date (not a forecast)
    const resp = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=13.7563&longitude=100.5018&start_date=${dataDate}&end_date=${dataDate}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FBangkok`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = (await resp.json()) as {
      daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[] }
    }
    const d = data.daily
    if (!d.time?.length) throw new Error("No archive data for date")
    const tAvg = Math.round(((d.temperature_2m_max[0] + d.temperature_2m_min[0]) / 2) * 10) / 10
    const wCode = d.weathercode[0]
    const tempCat = classifyTemp(tAvg)
    const supplyShock = wCode >= 80 ? `Weather: ${wCode >= 95 ? "Thunderstorm" : "Heavy Rain"}` : null
    await upsertEggRow({ date: dataDate, avg_temp_celsius: tAvg, temp_category: tempCat, ...(supplyShock && { supply_shock: supplyShock }) })
    await logCron("fetch-weather-daily", "success", Date.now() - t, 1)
    return NextResponse.json({ status: "ok", date: dataDate, avg_temp: tAvg, temp_category: tempCat })
  } catch (e) {
    await logCron("fetch-weather-daily", "failed", Date.now() - t, 0, String(e))
    return NextResponse.json({ status: "failed", error: String(e) }, { status: 500 })
  }
}
