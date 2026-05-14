import { NextRequest, NextResponse } from "next/server"
import { insertNewArticles, logCron } from "@/lib/db"
import { fetchTavily, QUERY_A, QUERY_B, QUERY_C } from "@/lib/news-fetch"
import type { NewsItem } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

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

  try {
    const results = await Promise.allSettled([
      fetchTavily(QUERY_A, 15),
      fetchTavily(QUERY_B, 15),
      fetchTavily(QUERY_C, 15),
    ])
    const allItems = results.flatMap((r) => r.status === "fulfilled" ? r.value : [])
    if (!allItems.length) throw new Error("All Tavily queries failed")

    // Deduplicate by URL/title before passing to insertNewArticles
    const seen = new Set<string>()
    const merged: Partial<NewsItem>[] = []
    for (const item of allItems) {
      const key = item.url ?? item.title ?? ""
      if (key && !seen.has(key)) { seen.add(key); merged.push(item) }
    }

    const inserted = await insertNewArticles("general", merged)
    await logCron("fetch-news-15min", "success", Date.now() - t, inserted)
    return NextResponse.json({ status: "ok", fetched: merged.length, inserted })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logCron("fetch-news-15min", "failed", Date.now() - t, 0, msg)
    return NextResponse.json({ status: "failed", error: msg }, { status: 500 })
  }
}
