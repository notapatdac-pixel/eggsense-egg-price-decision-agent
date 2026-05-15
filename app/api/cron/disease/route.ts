import { NextRequest, NextResponse } from "next/server"
import { upsertEggRow, logCron } from "@/lib/db"
import { cronAuth } from "../_auth"
export const runtime = "nodejs"

const DKW = ["avian influenza", "h5n1", "h5n2", "h5n6", "bird flu", "hpai", "newcastle disease", "poultry disease", "ไข้หวัดนก"]
const TKW = ["thailand", "thai", "ประเทศไทย", "southeast asia", "asean", "chiang mai", "bangkok"]

const SHORT_DISEASE: [RegExp, string][] = [
  [/h5n1/i,          "H5N1"],
  [/h5n2/i,          "H5N2"],
  [/h5n6/i,          "H5N6"],
  [/h7n9/i,          "H7N9"],
  [/hpai/i,          "HPAI"],
  [/newcastle/i,     "Newcastle"],
  [/ไข้หวัดนก/,      "ไข้หวัดนก"],
  [/bird flu/i,      "Avian Flu"],
  [/avian influenza/i, "Avian Flu"],
  [/poultry disease/i, "Poultry"],
]

function ditDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())
}

function extractShortName(text: string): string | null {
  for (const [re, name] of SHORT_DISEASE) {
    if (re.test(text)) return name
  }
  return null
}

// PRIMARY: Tavily web search — enforces 30-day filter server-side
async function tavilySearch(): Promise<{ text: string; count: number }> {
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: "avian influenza bird flu Thailand poultry HPAI ไข้หวัดนก",
        max_results: 10,
        days: 30,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return { text: "", count: 0 }
    const d = (await r.json()) as { results: Array<{ title: string; content: string }> }
    const results = d.results ?? []
    return {
      text: results.map((x) => `${x.title} ${x.content}`).join(" ").toLowerCase(),
      count: results.length,
    }
  } catch {
    return { text: "", count: 0 }
  }
}

// FALLBACK: GDELT free news index — no API key needed, real-time global news
async function gdeltSearch(): Promise<{ text: string; count: number }> {
  try {
    const q = encodeURIComponent('"bird flu" OR "avian influenza" OR "HPAI" Thailand')
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&timespan=30d&maxrecords=10&sort=DateDesc`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { text: "", count: 0 }
    const d = (await r.json()) as { articles?: Array<{ title: string }> }
    const articles = d.articles ?? []
    return {
      text: articles.map((a) => a.title).join(" ").toLowerCase(),
      count: articles.length,
    }
  } catch {
    return { text: "", count: 0 }
  }
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }

async function handler(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const t = Date.now()
  const dataDate = ditDate()

  // Tavily primary — more current and Thailand-specific than WHO RSS
  const tv = await tavilySearch()
  let recentText = tv.text
  let recentItems = tv.count
  let source = "tavily"

  // GDELT fallback only if Tavily returned nothing
  if (!recentItems) {
    const gd = await gdeltSearch()
    recentText = gd.text
    recentItems = gd.count
    source = "gdelt"
  }

  const hasDisease = DKW.some((k) => recentText.includes(k))
  const hasThai    = TKW.some((k) => recentText.includes(k))

  let status: string, impact: string, event: string | null = null
  if (!hasDisease) {
    status = "None"; impact = "None"
  } else if (hasThai) {
    status = "Active"; impact = "High"
    event = extractShortName(recentText)
  } else {
    status = "Monitoring"; impact = "Low"
    event = extractShortName(recentText)
  }

  await upsertEggRow({ date: dataDate, disease_event: event, disease_status: status, disease_supply_impact: impact })
  await logCron("fetch-disease-daily", "success", Date.now() - t, 1)
  return NextResponse.json({
    status: "ok",
    date: dataDate,
    disease_status: status,
    disease_event: event,
    source,
    items_checked: recentItems,
  })
}
