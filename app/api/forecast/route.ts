import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAiProfile, getOffset, getLatestEggPrice } from "@/lib/db"
import { computeForecast, generateSignal } from "@/agent/tools/price-forecaster"
import type { Grade } from "@/lib/types"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const grade = parseInt(searchParams.get("grade") ?? "0") as Grade
  const raw   = searchParams.get("raw") === "1"

  const profile = raw ? null : await getAiProfile(user.id)
  const offset  = raw ? 0   : getOffset(profile, grade)
  const forecast = await computeForecast(grade, 14, offset)
  const todayPrice = await getLatestEggPrice(grade)
  const signal = generateSignal(forecast, todayPrice + offset)

  return NextResponse.json({ forecast, signal, userOffset: offset })
}
