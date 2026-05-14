import { NextRequest, NextResponse } from "next/server"
import { getActiveNews, insertNewArticles } from "@/lib/db"
import { relTime, fetchTavily, detectCategory, QUERY_A, QUERY_B, QUERY_C } from "@/lib/news-fetch"
import type { NewsItem } from "@/lib/types"

/** Apply fresh time labels and sort newest-first */
function freshen(items: Partial<NewsItem>[]): NewsItem[] {
  return items
    .map((n) => ({ ...n, time_ago_label: relTime(n.published_at) ?? "recently" } as NewsItem))
    .filter((n) => relTime(n.published_at) !== null)
    .sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function mock(): Partial<NewsItem>[] {
  return [
    {
      title: "Thai diesel prices rise on OPEC+ output cuts",
      snippet: "Bangchak raised diesel by ฿0.40/L following OPEC+ supply cuts. Transport and farm energy costs are rising, typically pushing egg prices up ฿0.10–0.20/unit within one week.",
      category: "OIL & ENERGY", source: "Bangkok Post",
      url: null, published_at: daysAgo(0), image_url: null,
    },
    {
      title: "Corn futures drop 3.8% on strong US harvest forecasts",
      snippet: "CBOT corn price settled at $4.12/bushel. Thai feed mills expect a 2–3% input cost reduction over the next 4 weeks, easing downward pressure on egg prices.",
      category: "FEED COSTS", source: "CME Group",
      url: null, published_at: daysAgo(0), image_url: null,
    },
    {
      title: "H5N1 avian influenza protocols tightened for Central Thailand farms",
      snippet: "DLD issued new farm biosecurity guidelines after isolated H5N1 detections. Affected provinces could see a 15–25% egg supply reduction if the outbreak spreads.",
      category: "DISEASE", source: "AgriWire",
      url: null, published_at: daysAgo(1), image_url: null,
    },
    {
      title: "Heavy rain and flood risk forecast for Northern Thailand egg farms",
      snippet: "TMD warns above-normal rainfall in Chiang Mai and Chiang Rai through month-end. Barn flooding could cut laying hen output by 8–12% in affected areas.",
      category: "WEATHER", source: "ThaiMet",
      url: null, published_at: daysAgo(1), image_url: null,
    },
    {
      title: "Red Sea shipping disruption drives grain supply costs up 18%",
      snippet: "Carriers rerouting around the Cape of Good Hope raised corn and soybean freight from South America to Asia by 18%, adding ฿0.15–0.25/kg to Thai feed imports.",
      category: "WAR & TRADE", source: "Reuters",
      url: null, published_at: daysAgo(2), image_url: null,
    },
    {
      title: "Commerce Ministry considers raising egg price ceiling to ฿4.60",
      snippet: "Officials are reviewing the Grade 2 recommended retail price amid elevated diesel and soybean costs. A rise from ฿4.40 to ฿4.60 would be the first adjustment in 18 months.",
      category: "POLICY", source: "Nation Thailand",
      url: null, published_at: daysAgo(3), image_url: null,
    },
    {
      title: "Soybean meal price climbs 6% on Argentina drought concerns",
      snippet: "Buenos Aires Grain Exchange cut Argentina's soy harvest estimate by 4M tonnes due to La Niña dryness. Feed cost pressure for Thai poultry farms expected to persist 6–8 weeks.",
      category: "FEED COSTS", source: "FeedGrain",
      url: null, published_at: daysAgo(3), image_url: null,
    },
    {
      title: "Thailand secures ASEAN preferential tariff for egg exports",
      snippet: "New framework gives Thai egg exporters preferential market access to Vietnam and Malaysia, potentially diverting 3–5% of domestic supply and supporting local prices.",
      category: "EXPORT", source: "ThansettaKij",
      url: null, published_at: daysAgo(4), image_url: null,
    },
    {
      title: "Ukraine grain corridor deal renewed for 6 months",
      snippet: "Renewed Black Sea export agreement stabilises global wheat prices. Thai poultry sector may benefit as soybean substitution demand eases, lowering domestic feed costs.",
      category: "WAR & TRADE", source: "Reuters",
      url: null, published_at: daysAgo(5), image_url: null,
    },
    {
      title: "Labour Ministry wage hike adds ฿0.05–0.08 per egg to farm costs",
      snippet: "A 5% farm-worker minimum wage increase takes effect next month. Thai egg producers estimate an average cost pass-through of ฿0.05–0.08 per egg to wholesale prices.",
      category: "POLICY", source: "Krungthep Turakij",
      url: null, published_at: daysAgo(6), image_url: null,
    },
    {
      title: "Heat wave cuts laying rates 15–20% at Suphan Buri egg farms",
      snippet: "Temperatures above 38°C for 5 consecutive days have stressed laying hens in Suphan Buri and Nakhon Pathom — two of the top egg-supply provinces for Bangkok.",
      category: "WEATHER", source: "AgriWire",
      url: null, published_at: daysAgo(7), image_url: null,
    },
    {
      title: "Thai egg farm biosecurity upgraded after regional bird flu alert",
      snippet: "DLD ordered 500 commercial egg farms to install new biosecurity checkpoints following a regional H5N1 alert from the OIE. No confirmed cases in Thailand yet.",
      category: "PRODUCTION", source: "DLD Thailand",
      url: null, published_at: daysAgo(8), image_url: null,
    },
  ]
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "4"), 60)

  // Serve from DB when we have enough real Thai articles
  const rows = await getActiveNews("general", 60)
  const thaiRows = rows.filter((r) => detectCategory(r.title ?? "", r.snippet ?? "") !== null)
  if (thaiRows.length >= 4) {
    const news = freshen(thaiRows)
    return NextResponse.json({ news: news.slice(0, limit), total: news.length, from_db: true })
  }

  // DB empty or insufficient — fetch from Tavily and populate DB
  try {
    const results = await Promise.allSettled([
      fetchTavily(QUERY_A, 15),
      fetchTavily(QUERY_B, 15),
      fetchTavily(QUERY_C, 15),
    ])
    const allItems = results.flatMap((r) => r.status === "fulfilled" ? r.value : [])
    const seen = new Set<string>()
    const merged: Partial<NewsItem>[] = []
    for (const item of allItems) {
      const key = item.url ?? item.title ?? ""
      if (key && !seen.has(key)) { seen.add(key); merged.push(item) }
    }
    if (merged.length) await insertNewArticles("general", merged)
    const news = freshen(merged.length ? merged : mock())
    return NextResponse.json({ news: news.slice(0, limit), total: news.length, from_db: false })
  } catch {
    const news = freshen(mock())
    return NextResponse.json({ news: news.slice(0, limit), total: news.length, from_db: false, fallback: true })
  }
}
