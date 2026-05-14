import { NextRequest, NextResponse } from "next/server"
import { upsertEggRow, logCron } from "@/lib/db"
export const runtime = "nodejs"

const DIT      = "https://data.moc.go.th/OpenData/GISProductPrice"
const DIT_CORN    = "W16040"  // ข้าวโพดเลี้ยงสัตว์ ราคาส่งออก FOB
const DIT_SOYBEAN = "W17012"  // กากถั่วเหลืองนำเข้า โปรตีนร้อยละ 47

// DIT publishes D-1 data (same as egg prices)
function ditDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split("T")[0]
}

async function ditPrice(productId: string, date: string): Promise<number | null> {
  try {
    const r = await fetch(`${DIT}?product_id=${productId}&from_date=${date}&to_date=${date}`, {
      headers: { "User-Agent": "EggSense/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const d = (await r.json()) as Record<string, unknown>
    const recs = (d.data ?? d.result ?? (Array.isArray(d) ? d : [])) as Record<string, unknown>[]
    if (!recs.length) return null
    const avg = parseFloat(String(recs[0].average ?? recs[0].avg ?? recs[0].price_avg ?? ""))
    if (isNaN(avg)) return null
    // DIT quotes corn/soybean in THB/kg — sanity check: if >100 assume THB/ton, convert
    return avg > 100 ? Math.round((avg / 1000) * 100) / 100 : Math.round(avg * 100) / 100
  } catch {
    return null
  }
}

// CBOT fallback — used only when DIT returns null
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

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }

async function handler(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const t = Date.now()
  const today    = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())
  const dataDate = ditDate()

  // Try DIT Thai domestic prices first (D-1 data, same cadence as eggs)
  const [ditCorn, ditSoybean] = await Promise.all([
    ditPrice(DIT_CORN, dataDate),
    ditPrice(DIT_SOYBEAN, dataDate),
  ])

  let corn    = ditCorn
  let soybean = ditSoybean
  let source  = "dit"

  // Fall back to CBOT Yahoo Finance if DIT returned nothing
  if (!corn || !soybean) {
    const [rate, cornUsd, soybeanUsd] = await Promise.all([
      usdThb(),
      corn    ? Promise.resolve(null) : yahooPrice("ZC=F"),
      soybean ? Promise.resolve(null) : yahooPrice("ZM=F"),
    ])
    const BUSHEL = 25.4012
    const TON    = 907.185
    if (!corn && cornUsd)    corn    = Math.round((cornUsd / 100 / BUSHEL) * rate * 100) / 100
    if (!soybean && soybeanUsd) soybean = Math.round((soybeanUsd / TON) * rate * 100) / 100
    source = ditCorn || ditSoybean ? "dit+cbot" : "cbot"
  }

  if (!corn && !soybean) {
    await logCron("fetch-feedcosts-daily", "failed", Date.now() - t, 0, "DIT and Yahoo both returned no data")
    return NextResponse.json({ status: "failed" }, { status: 500 })
  }

  const row: Record<string, unknown> = { date: today }
  if (corn)    row.corn_price_thb          = corn
  if (soybean) row.soybean_meal_price_thb  = soybean

  await upsertEggRow(row)
  await logCron("fetch-feedcosts-daily", "success", Date.now() - t, 1)
  return NextResponse.json({ status: "ok", date: today, corn_thb: corn, soybean_thb: soybean, source })
}
