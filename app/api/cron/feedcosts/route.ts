import { NextRequest, NextResponse } from "next/server"
import { upsertEggRow, logCron } from "@/lib/db"
export const runtime = "nodejs"

async function yahooPrice(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return null
    const d = (await r.json()) as { chart: { result: Array<{ meta: { regularMarketPrice: number } }> } }
    return d.chart.result?.[0]?.meta?.regularMarketPrice ?? null
  } catch {
    return null
  }
}

async function usdThb(): Promise<number> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) })
    const d = (await r.json()) as { rates: { THB: number } }
    return d.rates.THB ?? 35
  } catch {
    return 35
  }
}

function auth(req: NextRequest) {
  const h = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  return h === process.env.CRON_SECRET
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
  const today = new Date().toISOString().split("T")[0]
  const [rate, cornUsd, soybeanUsd] = await Promise.all([usdThb(), yahooPrice("ZC=F"), yahooPrice("ZM=F")])
  const BUSHEL = 25.4012
  const TON = 907.185
  const corn = cornUsd ? Math.round((cornUsd / BUSHEL) * rate * 100) / 100 : null
  const soybean = soybeanUsd ? Math.round((soybeanUsd / TON) * rate * 100) / 100 : null
  if (!corn && !soybean) {
    await logCron("fetch-feedcosts-daily", "failed", Date.now() - t, 0, "Yahoo returned no data")
    return NextResponse.json({ status: "failed" }, { status: 500 })
  }
  const row: Record<string, unknown> = { date: today }
  if (corn) row.corn_price_thb = corn
  if (soybean) row.soybean_meal_price_thb = soybean
  await upsertEggRow(row)
  await logCron("fetch-feedcosts-daily", "success", Date.now() - t, 1)
  return NextResponse.json({ status: "ok", date: today, corn_thb: corn, soybean_thb: soybean })
}
