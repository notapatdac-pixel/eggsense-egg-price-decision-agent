import { NextRequest, NextResponse } from "next/server"
import { upsertOilRow, upsertEggRow, getLatestOil, logCron } from "@/lib/db"

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

// Use Bangkok date (UTC+7) — cron runs at 22:30 UTC = 05:30 BKK (next calendar day in UTC)
function todayBKK(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())
}

// Bangchak returns OilPriceDate in various formats — normalise to YYYY-MM-DD
function parseBangchakDate(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // DD/MM/YYYY (Thai locale)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  return null
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
  const today = todayBKK()
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

      const oilListStr = rec["OilList"] as string
      const items = JSON.parse(typeof oilListStr === "string" ? oilListStr : "[]") as Array<{
        OilName: string
        PriceToday: number
      }>

      const effectiveDate = parseBangchakDate(rec["OilPriceDate"]) ?? today
      const priceChanged  = effectiveDate >= today
      row = {
        price_date: today,
        effective_date: effectiveDate,
        effective_time: rec["OilPriceTime"] ?? null,
        remark: priceChanged ? `Price Change · ${effectiveDate}` : `Carry-forward · ${effectiveDate}`,
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
        const prev = await getLatestOil()
        if (prev.price_date) {
          row = {
            ...prev,
            price_date: today,
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

  // Patch today's egg_price_daily row with fresh diesel price so forecast uses today's oil
  if (ok && row.hi_diesel) {
    await upsertEggRow({ date: today, diesel_price_thb: row.hi_diesel as number })
  }

  await logCron("fetch-oil-daily", ok ? "success" : "failed", Date.now() - t, ok ? 1 : 0)
  return NextResponse.json({ status: ok ? "ok" : "failed", price_date: today, hi_diesel: row.hi_diesel })
}
