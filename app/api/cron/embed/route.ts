import { NextRequest, NextResponse } from "next/server"
import { embedDailyPrices, embedNewsArticles, seedKnowledgeBase } from "@/agent/tools/knowledge-retriever"
import { logCron } from "@/lib/db"
import { cronAuth } from "../_auth"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }

async function handler(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const t = Date.now()
  try {
    await seedKnowledgeBase()
    await embedDailyPrices()
    await embedNewsArticles()
    await logCron("embed-daily", "success", Date.now() - t, 1)
    return NextResponse.json({ status: "ok" })
  } catch (e) {
    await logCron("embed-daily", "failed", Date.now() - t, 0, String(e))
    return NextResponse.json({ status: "failed", error: String(e) }, { status: 500 })
  }
}
