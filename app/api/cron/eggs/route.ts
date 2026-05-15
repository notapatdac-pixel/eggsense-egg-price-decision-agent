import { NextRequest, NextResponse } from "next/server"
import { upsertEggRow, getLatestOil, logCron } from "@/lib/db"
import { cronAuth } from "../_auth"
export const runtime = "nodejs"

const DIT = "https://pricelist.dit.go.th/main_price.php"
// Retail (ขายปลีก) product IDs: P11025-P11030, progroup=P11000, protype=1
const GCF: Record<number, [string, string, string, string]> = {
  0: ["P11025", "g0_jumbo_min", "g0_jumbo_max", "g0_jumbo_avg"],
  1: ["P11026", "g1_xlarge_min", "g1_xlarge_max", "g1_xlarge_avg"],
  2: ["P11027", "g2_large_min", "g2_large_max", "g2_large_avg"],
  3: ["P11028", "g3_medium_min", "g3_medium_max", "g3_medium_avg"],
  4: ["P11029", "g4_small_min", "g4_small_max", "g4_small_avg"],
  5: ["P11030", "g5_petite_min", "g5_petite_max", "g5_petite_avg"],
}

// Return today's date in Thai Buddhist Era format DD/MM/YYYY (BE = CE + 543)
function ditDate(): string {
  const bkk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())
  const [year, month, day] = bkk.split("-")
  return `${day}/${month}/${parseInt(year) + 543}`
}

async function fetchGrade(grade: number, date: string): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; err: string }> {
  const [pid, cMin, cMax, cAvg] = GCF[grade]
  try {
    const body = `day1=${date}&day2=${date}&protype=1&progroup=P11000&proname=${pid}&seltime=day`
    const r = await fetch(`${DIT}?seltime=day`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "EggSense/1.0",
        "Referer": "https://pricelist.dit.go.th/",
      },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { ok: false, err: `HTTP ${r.status}` }
    const html = await r.text()

    // DIT embeds Highcharts data as JS arrays in the response HTML:
    //   ranges   = [[timestamp, min, max]]  (3-value tuple)
    //   averages = [\n  [timestamp, avg]\n] (2-value tuple, split across lines)
    const rangeMatch = html.match(/\[\s*\[\s*\d+\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/)
    const avgMatch = html.match(/\[\s*\[\s*\d+\s*,\s*([\d.]+)\s*\]\s*\]/)

    const lo = rangeMatch ? parseFloat(rangeMatch[1]) : NaN
    const hi = rangeMatch ? parseFloat(rangeMatch[2]) : NaN
    const avg = avgMatch ? parseFloat(avgMatch[1]) : NaN

    if (isNaN(lo) && isNaN(hi) && isNaN(avg)) {
      const snippet = html.slice(html.indexOf("ranges"), html.indexOf("ranges") + 200).replace(/\s+/g, " ")
      return { ok: false, err: `no_data snippet=${snippet || "not found"}` }
    }

    const computedAvg = !isNaN(avg)
      ? avg
      : !isNaN(lo) && !isNaN(hi) ? (lo + hi) / 2 : isNaN(lo) ? hi : lo

    return {
      ok: true,
      data: {
        [cMin]: isNaN(lo) ? null : lo,
        [cMax]: isNaN(hi) ? null : hi,
        [cAvg]: Math.round(computedAvg * 10000) / 10000,
      },
    }
  } catch (e) {
    return { ok: false, err: String(e) }
  }
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }

async function handler(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const t = Date.now()
  const dataDate = ditDate()

  // All 6 grade fetches run in parallel; each has its own 8s timeout
  const results = await Promise.all([0, 1, 2, 3, 4, 5].map((g) => fetchGrade(g, dataDate)))

  // Convert BE date DD/MM/YYYY → CE YYYY-MM-DD for the DB row
  const [dd, mm, beYear] = dataDate.split("/")
  const ceDate = `${parseInt(beYear) - 543}-${mm}-${dd}`
  const row: Record<string, unknown> = { date: ceDate }
  const errors: Record<number, string> = {}
  let ok = 0
  for (let g = 0; g <= 5; g++) {
    const r = results[g]
    if (r.ok) { Object.assign(row, r.data); ok++ }
    else errors[g] = r.err
  }

  if (!ok) {
    console.error("[eggs-cron] all grades failed:", errors)
    await logCron("fetch-eggs-daily", "failed", Date.now() - t, 0, JSON.stringify(errors).slice(0, 200))
    return NextResponse.json({ status: "failed", errors }, { status: 500 })
  }

  const avgs = [0, 1, 2, 3, 4, 5].map((g) => row[GCF[g][3]] as number).filter(Boolean)
  row.avg_egg_price = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10000) / 10000 : null

  const oil = await getLatestOil()
  row.diesel_price_thb = (oil.hi_diesel as number) ?? null

  await upsertEggRow(row)
  const status = ok === 6 ? "success" : "partial"
  await logCron("fetch-eggs-daily", status, Date.now() - t, 1, ok < 6 ? `${ok}/6 grades` : undefined)
  return NextResponse.json({ status, date: row.date, grades: ok })
}
