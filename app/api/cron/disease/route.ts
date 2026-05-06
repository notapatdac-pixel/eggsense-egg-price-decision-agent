import { NextRequest, NextResponse } from "next/server"
import { upsertEggRow, logCron } from "@/lib/db"
export const runtime = "nodejs"

const WHO_RSS = "https://www.who.int/feeds/entity/csr/don/en/rss.xml"
const DKW = ["avian influenza", "h5n1", "h5n2", "bird flu", "newcastle disease", "poultry disease", "ไข้หวัดนก"]
const TKW = ["thailand", "thai", "ประเทศไทย", "southeast asia", "asean"]

function auth(req: NextRequest) {
  const h = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  return h === process.env.CRON_SECRET
}

async function whoData() {
  try {
    const r = await fetch(WHO_RSS, { headers: { "User-Agent": "EggSense/1.0" }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) return { titles: [], summaries: [] }
    const xml = await r.text()
    const titles = (xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) ?? []).map((m) =>
      m.replace(/<\/?title[^>]*>|<!\[CDATA\[|\]\]>/g, "").trim()
    )
    const descs = (xml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/g) ?? []).map((m) =>
      m.replace(/<\/?description[^>]*>|<!\[CDATA\[|\]\]>/g, "").trim()
    )
    return { titles, summaries: descs }
  } catch {
    return { titles: [], summaries: [] }
  }
}

async function tavilyData() {
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: "avian influenza bird flu Thailand poultry disease 2025 ไข้หวัดนก",
        max_results: 5,
        days: 7,
      }),
      signal: AbortSignal.timeout(10000),
    })
    const d = (await r.json()) as { results: Array<{ title: string; content: string }> }
    return {
      titles: (d.results ?? []).map((x) => x.title),
      summaries: (d.results ?? []).map((x) => x.content?.slice(0, 200) ?? ""),
    }
  } catch {
    return { titles: [], summaries: [] }
  }
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
  let { titles, summaries } = await whoData()
  if (!titles.length) ({ titles, summaries } = await tavilyData())
  const combined = [...titles, ...summaries].join(" ").toLowerCase()
  const hasDisease = DKW.some((k) => combined.includes(k))
  const hasThai = TKW.some((k) => combined.includes(k))
  let status: string,
    impact: string,
    event: string | null = null
  if (!hasDisease) {
    status = "None"
    impact = "None"
  } else if (hasThai) {
    status = "Active"
    impact = "High"
    event = titles.find((t) => DKW.some((k) => t.toLowerCase().includes(k)))?.slice(0, 200) ?? null
  } else {
    status = "Monitoring"
    impact = "Low"
    event = titles[0]?.slice(0, 200) ?? null
  }
  await upsertEggRow({ date: today, disease_event: event, disease_status: status, disease_supply_impact: impact })
  await logCron("fetch-disease-daily", "success", Date.now() - t, 1)
  return NextResponse.json({ status: "ok", date: today, disease_status: status, disease_event: event })
}
