import { NextRequest, NextResponse } from "next/server"
import { upsertOilRow, getLatestOil, logCron } from "@/lib/db"

export const runtime = "nodejs"
export const maxDuration = 60

const BANGCHAK = "https://oil-price.bangchak.co.th/ApiOilPrice2/en"
const COL: Record<string, string> = {
  "Gasohol 95 S EVO": "gasohol_95",
  "Gasohol 91 S EVO": "gasohol_91",
  "Gasohol E20 S EVO": "e20",
  "Gasohol E85 S EVO": "e85",
  "Hi Diesel S": "hi_diesel",
  "Hi Premium Diesel Plus": "hi_premium_diesel",
  "DIESEL B20": "diesel_b20",
  "Hi Premium 98 Plus": "hi_premium_98_plus",
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
  let row: Record<string, unknown> | null = null

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(BANGCHAK, {
        headers: { "User-Agent": "EggSense/1.0", Referer: "https://www.bangchak.co.th/" },
        signal: AbortSignal.timeout(15000),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const raw = (await resp.json()) as Array<Record<string, unknown>>
      const rec = raw[0]
      if (!rec) throw new Error("Empty response")

      // OilList is double-encoded JSON string - parse twice
      const oilListStr = rec["OilList"] as string
      const items = JSON.parse(typeof oilListStr === "string" ? oilListStr : "[]") as Array<{
        OilName: string
        PriceToday: number
      }>

      // Effective price_date = announcement date + 1 day
      let priceDate = new Date()
      const ds = rec["OilPriceDate"] as string | undefined
      if (ds) {
        const [d, m, y] = ds.split("/").map(Number)
        priceDate = new Date(y, m - 1, d + 1)
      }

      row = {
        price_date: priceDate.toISOString().split("T")[0],
        effective_date: ds ?? null,
        effective_time: rec["OilPriceTime"] ?? null,
        remark: rec["OilRemark"] ?? null,
        is_interpolated: false,
        scraped_at: new Date().toISOString(),
      }
      for (const item of items) {
        const col = COL[item.OilName?.trim()]
        if (col) row[col] = parseFloat(String(item.PriceToday))
      }
      if (!row.hi_diesel) throw new Error("hi_diesel missing - API may have changed")
      break
    } catch (e) {
      if (attempt === 3) {
        // Interpolate from yesterday
        const prev = await getLatestOil()
        if (prev.price_date) {
          row = {
            ...prev,
            price_date: new Date().toISOString().split("T")[0],
            is_interpolated: true,
            remark: "Interpolated - API unavailable",
          }
        }
      } else await new Promise((r) => setTimeout(r, 5000 * attempt))
    }
  }

  if (!row) {
    await logCron("fetch-oil-daily", "failed", Date.now() - t, 0, "All attempts failed")
    return NextResponse.json({ status: "failed" }, { status: 500 })
  }

  const ok = await upsertOilRow(row)
  await logCron("fetch-oil-daily", ok ? "success" : "failed", Date.now() - t, ok ? 1 : 0)
  return NextResponse.json({ status: ok ? "ok" : "failed", price_date: row.price_date, hi_diesel: row.hi_diesel })
}
