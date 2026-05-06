import { db } from "@/lib/db"

// Embed text using Gemini text-embedding-004
// Free tier: 1500 RPD
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
