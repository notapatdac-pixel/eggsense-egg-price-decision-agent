import { NextRequest, NextResponse } from "next/server"
import { upsertEggRow, getLatestOil, logCron } from "@/lib/db"
export const runtime = "nodejs"
export const maxDuration = 60

const DIT = "https://data.moc.go.th/OpenData/GISProductPrice"
const GCF: Record<number, [string, string, string, string]> = {
  0: ["W11026", "g0_jumbo_min", "g0_jumbo_max", "g0_jumbo_avg"],
  1: ["W11027", "g1_xlarge_min", "g1_xlarge_max", "g1_xlarge_avg"],
  2: ["W11028", "g2_large_min", "g2_large_max", "g2_large_avg"],
  3: ["W11029", "g3_medium_min", "g3_medium_max", "g3_medium_avg"],
  4: ["W11030", "g4_small_min", "g4_small_max", "g4_small_avg"],
  5: ["W11031", "g5_petite_min", "g5_petite_max", "g5_petite_avg"],
}

async function fetchGrade(grade: number, date: string) {
  const [pid, cMin, cMax, cAvg] = GCF[grade]
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(`${DIT}?product_id=${pid}&from_date=${date}&to_date=${date}`, {
        headers: { "User-Agent": "EggSense/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = (await r.json()) as Record<string, unknown>
      const recs = (d.data ?? d.result ?? (Array.isArray(d) ? d : [])) as Record<string, unknown>[]
      if (!recs.length) return null
      const row = recs[0]
      const avg = parseFloat(String(row.average ?? row.avg ?? row.price_avg ?? ""))
      if (isNaN(avg)) return null
      return { [cMin]: parseFloat(String(row.min ?? "")) || null, [cMax]: parseFloat(String(row.max ?? "")) || null, [cAvg]: avg }
    } catch {
      if (i < 3) await new Promise((r) => setTimeout(r, 3000 * i))
    }
  }
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
  const today = new Date().toISOString().split("T")[0]
  const row: Record<string, unknown> = { date: today }
  let ok = 0
  for (let g = 0; g <= 5; g++) {
    const d = await fetchGrade(g, today)
    if (d) {
      Object.assign(row, d)
      ok++
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!ok) {
    await logCron("fetch-eggs-daily", "failed", Date.now() - t, 0, "0/6 grades")
    return NextResponse.json({ status: "failed" }, { status: 500 })
  }
  const avgs = [0, 1, 2, 3, 4, 5].map((g) => row[GCF[g][3]] as number).filter(Boolean)
  row.avg_egg_price = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10000) / 10000 : null
  const oil = await getLatestOil()
  row.diesel_price_thb = (oil.hi_diesel as number) ?? null
  await upsertEggRow(row)
  const status = ok === 6 ? "success" : "partial"
  await logCron("fetch-eggs-daily", status, Date.now() - t, 1, ok < 6 ? `${ok}/6 grades` : undefined)
  return NextResponse.json({ status, date: today, grades: ok })
}
