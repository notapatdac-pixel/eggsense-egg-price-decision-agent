import type { NewsItem } from "@/lib/types"

// Thai market — oil, feed, energy
export const QUERY_A = "ราคาน้ำมันดีเซลไทย บางจาก ปตท ราคาไข่ไก่ไทย กรมการค้าภายใน DIT ต้นทุนอาหารสัตว์ ข้าวโพด กากถั่วเหลือง ฟาร์มไก่ไทย Thailand diesel oil egg price feed cost poultry"

// Thai market — disease, weather, supply shock
export const QUERY_B = "ไข้หวัดนก H5N1 ไทย กรมปศุสัตว์ โรคระบาดสัตว์ปีกไทย ไข่ขาดตลาด น้ำท่วมฟาร์มไก่ ภัยแล้งไทย คลื่นความร้อน Thailand bird flu avian influenza poultry disease flood drought"

// Thai market — policy, trade, export/import
export const QUERY_C = "นโยบายราคาไข่ไก่ กระทรวงพาณิชย์ไทย กรมปศุสัตว์ ส่งออกไข่ไทย นำเข้าไข่ ASEAN อาเซียน ซีพีเอฟ เบทาโกร Thailand egg policy Commerce Ministry export import CPF Betagro trade"

const CAT: Array<[string, string[]]> = [
  ["OIL & ENERGY", ["oil price", "diesel", "petroleum", "crude oil", "fuel price", "opec", "energy cost", "electricity cost", "power tariff", "น้ำมัน", "ดีเซล", "bangchak", "บางจาก", "ราคาน้ำมัน", "ค่าไฟ", "ปตท", "ptt"]],
  ["FEED COSTS",   ["corn price", "soybean", "feed cost", "grain price", "wheat price", "cbot", "feed mill", "ข้าวโพด", "กากถั่ว", "อาหารสัตว์", "ราคาวัตถุดิบ", "ต้นทุนอาหารสัตว์"]],
  ["DISEASE",      ["avian influenza", "bird flu", "h5n1", "h5n", "avian flu", "poultry disease", "outbreak", "ไข้หวัดนก", "โรคระบาด", "กรมปศุสัตว์", "dld"]],
  ["WEATHER",      ["flood", "drought", "heat wave", "heatwave", "storm", "heavy rain", "el nino", "la nina", "น้ำท่วม", "ภัยแล้ง", "คลื่นความร้อน", "อุณหภูมิสูง", "ฝนตกหนัก"]],
  ["WAR & TRADE",  ["war", "conflict", "sanction", "ukraine", "russia", "middle east", "red sea", "shipping disruption", "strait of hormuz", "grain supply", "สงคราม", "ยูเครน", "รัสเซีย", "ฮอร์มุซ"]],
  ["POLICY",       ["egg price ceiling", "egg subsidy", "poultry policy", "commerce ministry", "price regulation", "กระทรวงพาณิชย์", "กรมการค้าภายใน", "dit", "นโยบายไข่", "ราคาควบคุม", "ราคาไข่ไก่คุม"]],
  ["EXPORT",       ["egg export", "poultry export", "egg import", "asean trade", "ส่งออกไข่", "นำเข้าไข่", "ตลาดอาเซียน"]],
  ["PRODUCTION",   ["laying hen", "egg farm", "poultry farm", "hatchery", "egg production", "ฟาร์มไข่", "แม่ไก่ไข่", "ไก่ไข่", "ซีพีเอฟ", "cpf", "betagro", "เบทาโกร"]],
]

// Thai relevance terms — checked against the TITLE only so only Thailand-primary articles pass
const THAI_TITLE_TERMS = [
  "thailand", "thai",
  "ไทย", "ประเทศไทย", "กรุงเทพ", "bangkok",
  "bangchak", "บางจาก", "ปตท", "ptt",
  "cpf", "ซีพีเอฟ", "betagro", "เบทาโกร",
  "dit", "กรมการค้าภายใน", "กรมปศุสัตว์", "กระทรวงพาณิชย์",
  "chiang mai", "เชียงใหม่", "lopburi", "ลพบุรี", "suphan buri", "สุพรรณบุรี",
  "south-east asia", "southeast asia", "asean", "อาเซียน",
]

export function detectCategory(title: string, snippet: string): string | null {
  const tTitle = title.toLowerCase()
  // Primary filter: Thailand must be the subject — check title only
  if (!THAI_TITLE_TERMS.some((k) => tTitle.includes(k))) return null
  const tFull = (title + " " + snippet).toLowerCase()
  for (const [cat, kws] of CAT) {
    if (kws.some((k) => tFull.includes(k))) return cat
  }
  return null
}

/** Recompute display label from published_at. Returns null when article is > 60 days old. */
export function relTime(pub: string | null | undefined): string | null {
  if (!pub) return "recently"
  const d = new Date(pub)
  if (isNaN(d.getTime())) return "recently"
  const diff = Date.now() - d.getTime()
  if (diff > 60 * 86400000) return null
  const h   = Math.floor(diff / 3600000)
  const day = Math.floor(diff / 86400000)
  if (h < 1)    return "Just now"
  if (h < 24)   return `${h}h ago`
  if (day === 1) return "Yesterday"
  if (day <= 6)  return `${day} days ago`
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export async function fetchTavily(query: string, n: number): Promise<Partial<NewsItem>[]> {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "advanced",
      topic: "news",
      max_results: n,
      include_images: true,
      days: 60,
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!resp.ok) throw new Error(`Tavily ${resp.status}`)

  const data = (await resp.json()) as { results: Array<Record<string, unknown>> }
  const articles: Partial<NewsItem>[] = []

  for (const item of data.results ?? []) {
    const pub = (item.published_date as string) ?? null
    if (!pub || relTime(pub) === null) continue

    const title   = (item.title   as string) ?? ""
    const content = (item.content as string) ?? ""
    const category = detectCategory(title, content)
    if (!category) continue

    const rawUrl = (item.url as string) ?? ""
    const domain = rawUrl.split("/")[2]?.replace("www.", "") ?? ""

    articles.push({
      title,
      url:         rawUrl || null,
      source:      domain || null,
      source_logo: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null,
      image_url:   ((item.images as string[] | null)?.[0] ?? null),
      snippet:     content.slice(0, 300),
      category,
      published_at: pub,
    })
  }
  return articles
}
