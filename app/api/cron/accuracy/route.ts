import { NextRequest, NextResponse } from "next/server"
import { backfillSignalActuals, logCron } from "@/lib/db"
import { cronAuth } from "../_auth"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }

async function handler(req: NextRequest) {
  if (!cronAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const t = Date.now()
  const { filled } = await backfillSignalActuals()
  await logCron("backfill-signal-accuracy", "success", Date.now() - t, filled)
  return NextResponse.json({ status: "ok", filled })
}
