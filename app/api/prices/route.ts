import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAllGradesLatest, getEggHistory, getOilHistory } from "@/lib/db"
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
  const days = parseInt(searchParams.get("days") ?? "60")

  const [allGradesPromises, history, oil] = await Promise.all([
    getAllGradesLatest(),
    getEggHistory(grade, days),
    getOilHistory(days),
  ])
  const allGrades = await Promise.all(allGradesPromises)

  return NextResponse.json({ allGrades, history, oil })
}
