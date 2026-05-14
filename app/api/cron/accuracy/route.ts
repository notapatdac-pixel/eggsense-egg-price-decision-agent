import { NextRequest, NextResponse } from "next/server"
import { backfillSignalActuals, logCron } from "@/lib/db"

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
  const { filled } = await backfillSignalActuals()
  await logCron("backfill-signal-accuracy", "success", Date.now() - t, filled)
  return NextResponse.json({ status: "ok", filled })
}
