import { db } from "@/lib/db"

// Embed text using Gemini text-embedding-004 (free tier: 1500 RPD)
export async function embedText(text: string): Promise<number[] | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
      }),
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as { embedding: { values: number[] } }
    return data.embedding?.values ?? null
  } catch {
    return null
  }
}

export async function retrieveContext(query: string, topK = 4): Promise<string[]> {
  try {
    const vec = await embedText(query)
    if (!vec) return []
    const { data } = await db().rpc("match_rag_documents", {
      query_embedding: `[${vec.join(",")}]`,
      match_threshold: 0.65,
      match_count: topK,
      filter_type: null,
    })
    return ((data ?? []) as Array<{ content: string }>).map((r) => r.content)
  } catch {
    return []
  }
}

export async function embedDailyPrices(): Promise<void> {
  const { data } = await db().from("egg_price_daily").select("*").order("date", { ascending: false }).limit(7)
  for (const row of data ?? []) {
    const text = [
      `Egg prices ${row.date}:`,
      `G0 ฿${row.g0_jumbo_avg}, G1 ฿${row.g1_xlarge_avg}, G2 ฿${row.g2_large_avg},`,
      `G3 ฿${row.g3_medium_avg}, G4 ฿${row.g4_small_avg}, G5 ฿${row.g5_petite_avg}.`,
      `Diesel ฿${row.diesel_price_thb}/L.`,
      `Temp ${row.avg_temp_celsius}°C (${row.temp_category}).`,
      `Corn ฿${row.corn_price_thb}/kg, Soybean ฿${row.soybean_meal_price_thb}/kg.`,
      row.disease_status !== "None" ? `Disease: ${row.disease_event} - ${row.disease_status}.` : "",
      row.demand_shock ? `Demand shock: ${row.demand_shock}.` : "",
      row.supply_shock ? `Supply shock: ${row.supply_shock}.` : "",
    ]
      .filter(Boolean)
      .join(" ")
    const vec = await embedText(text)
    if (!vec) continue
    await db().from("rag_embeddings").insert({
      content_type: "egg_price",
      content: text,
      metadata: { date: row.date },
      embedding: `[${vec.join(",")}]`,
    })
  }
}

// ─── Static domain knowledge ──────────────────────────────────────────────────
// These documents give the AI background knowledge beyond what's in the live DB.
// Sources: DIT, EPPO, Krungsri Research, Thai Restaurant Association, OAE.
// Idempotent — checks content_type="knowledge" count before inserting.

const KNOWLEDGE_DOCS = [
  `Thai egg market supply chain: Oil price rises cause egg price increases with a 14-day delay (r=0.72 confirmed). The ripple effect: diesel up → farm transport and electricity costs up → feed procurement costs up → egg price step-change at wholesale level. This 14-day lag is driven by inventory turnover (1-2 weeks), cost pass-through negotiation between farm and middlemen, and price anchoring behavior of sellers.`,

  `Thai SME egg buyer segments — CRITICAL (High consumption): Street food stalls, cafes, egg-based menu shops. Egg cost = 20-30% of selling price (e.g. fried egg rice sells ฿30-35, egg costs ฿4.20-4.50). These businesses are most exposed to price volatility. A ฿1/egg increase drops net profit 33.75%. EggSense can save up to ฿8,100/month by enabling proactive stock-locking before price spikes.`,

  `Thai SME egg buyer segments — MODERATE (Medium consumption): Casual restaurants, Thai food in malls. Egg cost = 7-12% of selling price. Egg add-ons priced ฿10-15 vs actual egg cost ~฿4.50, making add-ons a key margin driver. A ฿1/egg spike erodes ฿3,600/month in margin. EggSense saves up to ฿2,160/month by protecting add-on margin through timely buying.`,

  `Thai SME egg buyer segments — LOW RISK (Low consumption): Fine dining, premium steakhouses, boutique hotels. Use cage-free or vaccinated premium eggs at ฿8-12/egg. Egg cost < 2% of dish price (avg dish ฿300-1000+). Financially immaterial. Key risk is SUPPLY CONTINUITY not price — a stockout damages brand reputation more than cost. EggSense focus: ensure premium eggs never run out.`,

  `Egg price seasonality in Thailand: Demand spikes during Songkran (April 13-15) as families cook together, New Year (Jan 1 and Dec 31), and Mother's/Father's Day (Aug 12, Dec 5). Supply is tightest in April-May (hot season, laying rate drops 15-20% when temp >35°C). December-January supply is higher due to cooler weather. Chinese New Year (Jan/Feb variable) drives demand from Chinese-Thai restaurants.`,

  `Thai wholesale egg grade pricing (DIT national median, 2026 typical range): G0 Jumbo ฿4.65-4.90, G1 X-Large ฿4.45-4.70, G2 Large ฿4.25-4.50, G3 Medium ฿4.05-4.30, G4 Small ฿3.90-4.15, G5 Petite ฿3.75-4.00 per egg. Prices are government-monitored medians; actual farm-gate and retail prices vary by 10-20% by region. Bangkok and surrounding provinces tend to be 5-10% lower than northern regions.`,

  `Stock management best practice for Thai food SMEs: When EggSense signals an uptrend (BUY NOW), recommended stock-lock buffer = daily usage × 10 days. This covers the 14-day price propagation window with a safety margin. Eggs last 3-4 weeks refrigerated. Overstocking beyond 14 days risks spoilage and ties up working capital. Monitor diesel prices weekly via EPPO — a >5% week-on-week rise is the trigger threshold.`,

  `Animal feed prices and egg cost impact: Corn and soybean meal are the two main feed ingredients for Thai egg farms (70-80% of feed mix). Global CBOT corn futures (ZC=F) and soybean meal futures (ZM=F) affect Thai feed costs with 2-4 week lag after currency conversion. A 10% corn price rise adds approximately ฿0.03-0.05/egg to production cost. OAE (สำนักงานเศรษฐกิจการเกษตร) publishes monthly Thai feed prices as the official reference.`,
]

export async function seedKnowledgeBase(): Promise<void> {
  try {
    const { count } = await db()
      .from("rag_embeddings")
      .select("id", { count: "exact", head: true })
      .eq("content_type", "knowledge")
    if ((count ?? 0) >= KNOWLEDGE_DOCS.length) return
    for (const text of KNOWLEDGE_DOCS) {
      const vec = await embedText(text)
      if (!vec) continue
      await db().from("rag_embeddings").insert({
        content_type: "knowledge",
        content: text,
        metadata: { source: "static_seed", seeded_at: new Date().toISOString() },
        embedding: `[${vec.join(",")}]`,
      })
    }
  } catch (e) {
    console.error("seedKnowledgeBase:", e)
  }
}

export async function embedNewsArticles(): Promise<void> {
  const { data } = await db()
    .from("news_cache")
    .select("title,snippet,category,url,published_at")
    .gt("expires_at", new Date().toISOString())
    .limit(20)
  for (const row of data ?? []) {
    const text = `[${row.category}] ${row.title}. ${row.snippet ?? ""}`
    const vec = await embedText(text)
    if (!vec) continue
    await db().from("rag_embeddings").insert({
      content_type: "news",
      content: text,
      metadata: { url: row.url, published_at: row.published_at, category: row.category },
      embedding: `[${vec.join(",")}]`,
    })
  }
}
