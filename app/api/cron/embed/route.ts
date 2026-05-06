import { NextRequest, NextResponse } from "next/server"
import { embedDailyPrices, embedNewsArticles } from "@/agent/tools/rag"

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
  try {
    await embedDailyPrices()
    await embedNewsArticles()
    return NextResponse.json({ status: "ok" })
  } catch (e) {
    return NextResponse.json({ status: "failed", error: String(e) }, { status: 500 })
  }
}
