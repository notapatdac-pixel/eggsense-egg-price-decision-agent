import { NextRequest, NextResponse } from "next/server"
import { getCachedNews, saveNewsCache } from "@/lib/db"
import type { NewsItem } from "@/lib/types"

// Always fetch and cache this many items so "load more" is served from cache
const INTERNAL_LIMIT = 12

const QUERIES: Record<string, string> = {
  general: "Thailand egg price oil diesel soybean corn poultry feed disease war weather 2025 ราคาไข่ไก่",
  oil:     "Thailand diesel oil price transport fuel poultry cost 2025",
  war:     "war conflict Russia Ukraine Middle East grain supply disruption 2025",
  feed:    "corn soybean meal price Thailand poultry feed cost 2025 ข้าวโพด กากถั่วเหลือง",
  weather: "Thailand weather flood drought heat wave farm poultry agriculture 2025",
  disease: "avian influenza bird flu H5N1 Thailand poultry outbreak 2025 ไข้หวัดนก",
  policy:  "Thailand government egg price ceiling subsidy agriculture policy 2025",
  export:  "Thailand egg export ASEAN trade poultry 2025",
}

const CAT: Array<[string, string[]]> = [
  ["PRODUCTION",   ["biosecurity", "avian flu", "bird flu", "h5n1", "farm", "hatchery", "laying hen", "poultry", "ไข้หวัดนก", "สัตว์ปีก"]],
  ["FEED COSTS",   ["corn", "soybean", "feed", "grain", "wheat", "futures", "ข้าวโพด", "กากถั่ว", "อาหารสัตว์"]],
  ["OIL & ENERGY", ["oil", "diesel", "petroleum", "fuel", "energy", "opec", "น้ำมัน", "ดีเซล", "พลังงาน"]],
  ["WAR & TRADE",  ["war", "conflict", "sanction", "ukraine", "russia", "middle east", "gaza", "สงคราม", "อิสราเอล", "ยูเครน"]],
  ["WEATHER",      ["flood", "drought", "rain", "storm", "weather", "climate", "heat", "น้ำท่วม", "ภัยแล้ง", "คลื่นความร้อน"]],
  ["EXPORT",       ["export", "import", "asean", "trade", "tariff", "ส่งออก", "นำเข้า"]],
  ["POLICY",       ["ministry", "government", "subsidy", "regulation", "policy", "กระทรวง", "รัฐบาล", "นโยบาย"]],
  ["DISEASE",      ["disease", "virus", "outbreak", "epidemic", "โรค", "ระบาด", "เชื้อ"]],
]

const EGG_RELEVANT_CATS = new Set([
  "PRODUCTION", "FEED COSTS", "OIL & ENERGY", "WAR & TRADE",
  "WEATHER", "EXPORT", "POLICY", "DISEASE", "MARKET",
])

function detectCategory(title: string, snippet: string): string {
  const t = (title + " " + snippet).toLowerCase()
  for (const [cat, kws] of CAT) {
    if (kws.some((k) => t.includes(k))) return cat
  }
  return "MARKET"
}

/** Returns display label or null if article is older than 60 days */
function relTime(pub: string | null | undefined): string | null {
  if (!pub) return "recently"
  const d = new Date(pub)
  if (isNaN(d.getTime())) return "recently"
  const diff = Date.now() - d.getTime()
  if (diff > 60 * 86400000) return null   // hard cutoff: exclude > 60 days
  const h   = Math.floor(diff / 3600000)
  const day = Math.floor(diff / 86400000)
  if (h < 1)   return "Just now"
  if (h < 24)  return `${h}h ago`
  if (day === 1) return "Yesterday"
  if (day <= 6)  return `${day} days ago`
  // 7–59 days: show date like "1 Apr"
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function mock(type: string, n: number): Partial<NewsItem>[] {
  const all: Partial<NewsItem>[] = [
    {
      title: "Thai diesel prices rise on OPEC+ output cuts",
      snippet: "Bangchak raised diesel by ฿0.40/L following OPEC+ cuts. Transport and farm energy costs are rising, which typically pushes egg prices up ฿0.10–0.20/unit within one week.",
      category: "OIL & ENERGY", source: "Bangkok Post",
      url: "https://www.bangkokpost.com", time_ago_label: "3h ago", image_url: null,
    },
    {
      title: "H5N1 protocols tightened for Central Thailand farms",
      snippet: "DLD issued new biosecurity guidelines after isolated H5N1 detections. Affected provinces could see 15–25% supply reduction if spread continues.",
      category: "DISEASE", source: "AgriWire",
      url: "https://www.agri.go.th", time_ago_label: "5h ago", image_url: null,
    },
    {
      title: "Corn futures drop 3.8% on strong US harvest forecasts",
      snippet: "CBOT corn settled at $4.12/bushel. Thai feed mills expect 2–3% input cost reduction over next 4 weeks, supporting egg price stability.",
      category: "FEED COSTS", source: "CME Group",
      url: "https://www.cmegroup.com", time_ago_label: "6h ago", image_url: null,
    },
    {
      title: "Heavy rain forecast for Northern Thailand farm regions",
      snippet: "TMD warns above-normal rainfall in Chiang Mai and Chiang Rai through month-end. Barn flooding risk may cut output by 8–12% in affected areas.",
      category: "WEATHER", source: "ThaiMet",
      url: "https://www.tmd.go.th", time_ago_label: "Yesterday", image_url: null,
    },
    {
      title: "Red Sea disruptions drive grain shipping costs up 18%",
      snippet: "Carriers rerouting around Cape of Good Hope raised soybean/corn freight costs from South America to Asia by 18%, adding ฿0.15–0.25/kg to Thai feed imports.",
      category: "WAR & TRADE", source: "Reuters",
      url: "https://www.reuters.com", time_ago_label: "Yesterday", image_url: null,
    },
    {
      title: "Government considers raising egg price ceiling to ฿4.60",
      snippet: "Commerce Ministry reviewing Grade 2 recommended retail price amid elevated feed and diesel costs. A rise from ฿4.40 to ฿4.60 would be the first in 18 months.",
      category: "POLICY", source: "Nation Thailand",
      url: "https://www.nationthailand.com", time_ago_label: "2 days ago", image_url: null,
    },
    {
      title: "Thailand secures ASEAN preferential tariff for egg exports",
      snippet: "New framework gives Thai exporters preferential access to Vietnam and Malaysia, potentially reducing domestic supply by 3–5% and supporting local prices.",
      category: "EXPORT", source: "ThansettaKij",
      url: "https://www.thansettakij.com", time_ago_label: "3 days ago", image_url: null,
    },
    {
      title: "Soybean meal climbs 6% on Argentina drought concerns",
      snippet: "Buenos Aires Grain Exchange cut Argentina's soy estimate by 4M tonnes due to La Niña dryness. Feed cost pressure expected to persist 6–8 weeks.",
      category: "FEED COSTS", source: "FeedGrain",
      url: "https://www.reuters.com", time_ago_label: "4 days ago", image_url: null,
    },
    {
      title: "DIT reports G2 egg price unchanged at ฿4.40 for 5th day",
      snippet: "Department of Internal Trade daily median held steady. Traders cite balanced supply-demand but flag diesel prices and upcoming hot season as upside risks.",
      category: "MARKET", source: "DIT Thailand",
      url: "https://www.dit.go.th", time_ago_label: "5h ago", image_url: null,
    },
    {
      title: "Ukraine wheat corridor deal extends for 6 months",
      snippet: "Renewed Black Sea grain agreement stabilises global wheat prices. Indirect benefit for Thai poultry sector: soybean substitution demand may ease, lowering feed costs.",
      category: "WAR & TRADE", source: "Reuters",
      url: "https://www.reuters.com", time_ago_label: "5 days ago", image_url: null,
    },
    {
      title: "Thai farm minimum wage hike adds ฿0.05–0.08/egg to costs",
      snippet: "Labour Ministry's 5% wage increase for farm workers takes effect next month. Egg producers estimate an average cost pass-through of ฿0.05–0.08 per egg.",
      category: "POLICY", source: "Krungthep Turakij",
      url: "https://www.krungthepturakij.com", time_ago_label: "6 days ago", image_url: null,
    },
    {
      title: "Heat wave reduces laying rates 15–20% in Suphan Buri farms",
      snippet: "Temperatures above 38°C for 5 consecutive days have stressed laying hens in Suphan Buri and Nakhon Pathom — key production hubs supplying Bangkok markets.",
      category: "WEATHER", source: "AgriWire",
      url: "https://www.agri.go.th", time_ago_label: "1 Apr", image_url: null,
    },
  ]
  const MAP: Record<string, string> = {
    oil: "OIL & ENERGY", war: "WAR & TRADE", feed: "FEED COSTS",
    weather: "WEATHER", disease: "DISEASE", policy: "POLICY", export: "EXPORT",
  }
  const filtered = type === "general" ? all : all.filter((x) => x.category === MAP[type])
  return (filtered.length ? filtered : all).slice(0, n)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type  = searchParams.get("type")  ?? "general"
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "4"), 20)
  const query = QUERIES[type] ?? QUERIES.general

  // Cache check: if we have INTERNAL_LIMIT cached items, serve from DB (saves Tavily tokens)
  const cached = (await getCachedNews(type, INTERNAL_LIMIT))
    .filter((n) => relTime(n.published_at) !== null)
    .sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())

  if (cached.length >= 4) {
    return NextResponse.json({ news: cached.slice(0, limit), total: cached.length, from_cache: true })
  }

  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "advanced",
        max_results: INTERNAL_LIMIT * 3,
        include_images: true,
        days: 60,
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`Tavily HTTP ${resp.status}`)

    const data = (await resp.json()) as { results: Array<Record<string, unknown>> }
    const articles: Partial<NewsItem>[] = []

    for (const item of data.results ?? []) {
      const pub = (item.published_date as string) ?? null
      const t   = relTime(pub)
      if (!t) continue

      const title    = (item.title   as string) ?? ""
      const content  = (item.content as string) ?? ""
      const category = detectCategory(title, content)
      if (!EGG_RELEVANT_CATS.has(category)) continue

      const domain = ((item.url as string) ?? "").split("/")[2]?.replace("www.", "") ?? ""
      articles.push({
        title,
        url:             (item.url as string) ?? "#",
        source:          domain,
        source_logo:     `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
        image_url:       (((item.images as string[] | null) ?? [])[0] ?? null) as string | null,
        snippet:         content.slice(0, 200),
        category,
        published_at:    pub,
        time_ago_label:  t,
      })
      if (articles.length >= INTERNAL_LIMIT) break
    }

    // Sort by date desc and cache the full set
    articles.sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())
    if (articles.length) await saveNewsCache(type, articles)

    const news = articles.length ? articles : mock(type, INTERNAL_LIMIT)
    return NextResponse.json({ news: news.slice(0, limit), total: news.length, from_cache: false })
  } catch {
    const fallback = mock(type, INTERNAL_LIMIT)
    return NextResponse.json({ news: fallback.slice(0, limit), total: fallback.length, from_cache: false, fallback: true })
  }
}
