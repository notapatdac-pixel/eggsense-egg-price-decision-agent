import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ensureUser, getAiProfile, loadHistory, saveMsg, upsertAiProfile, saveSignal, trackQuestion, getCachedForecast, getContextFactors } from "@/lib/db"
import { runAgentTurn } from "@/agent/main"
import { runPlanner } from "@/agent/planner"
import { retrieveContext } from "@/agent/tools/knowledge-retriever"
import type { AiProfile, Grade } from "@/lib/types"

function parseGradeNum(grade?: string): Grade | null {
  if (!grade) return null
  const m = grade.match(/(\d)/)
  const n = m ? parseInt(m[1]) : NaN
  return !isNaN(n) && n >= 0 && n <= 5 ? (n as Grade) : null
}

function classifyQuestion(text: string): string | null {
  const t = text.toLowerCase()
  const relevant = /egg|ไข่|ราคา|price|grade|เกรด|farm|ฟาร์ม|buy|ซื้อ|stock|สต็อก|forecast|แนวโน้ม|oil|น้ำมัน|feed|อาหารสัตว์|corn|soybean|poultry|disease|โรค|market|ตลาด|cost|ต้นทุน|dit|business|ธุรกิจ|bakery|cafe|restaurant|hotel/i
  if (!relevant.test(t)) return null
  if (/forecast|แนวโน้ม|trend|จะขึ้น|จะลง|next week|สัปดาห์หน้า|predict|คาด|พยากรณ์/.test(t)) return "FORECAST"
  if (/should i buy|ควรซื้อ|buy now|ซื้อตอนนี้|stock up|สต็อก|ควรสต็อก/.test(t)) return "BUYING_ADVICE"
  if (/oil|น้ำมัน|diesel|feed cost|อาหารสัตว์|corn|ข้าวโพด|soybean|grain|energy/.test(t)) return "MARKET_FACTOR"
  if (/news|ข่าว|disease|โรค|bird flu|ไข้หวัด|flood|drought|น้ำท่วม|ภัยแล้ง|war|conflict/.test(t)) return "MARKET_NEWS"
  if (/cost|ต้นทุน|spend|monthly|เดือนละ|per month/.test(t)) return "COST_ANALYSIS"
  if (/price|ราคา|how much|เท่าไหร่|กี่บาท|current|today|วันนี้/.test(t)) return "PRICE_CHECK"
  return "BUSINESS_ADVICE"
}

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const message = body.message?.trim()
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 })

  // Guarantee user row exists before FK-constrained inserts
  await ensureUser(user.id, user.email)
  // Planner runs in parallel with DB fetches — zero extra latency on the critical path
  const [profile, history, rag, planner] = await Promise.all([
    getAiProfile(user.id),
    loadHistory(user.id, 20),
    retrieveContext(message, 4),
    runPlanner(message),
  ])

  try {
    // Save user message first so it always gets a lower DB ID than the assistant reply
    await saveMsg(user.id, "user", message)

    const result = await runAgentTurn(user.id, message, history, profile, rag, planner)

    const topic = classifyQuestion(message)

    // Look up cached forecast + market context for signal accuracy tracking
    let signalForecast7d: number | null = null
    let signalForecast14d: number | null = null
    let demandShock: string | null = null
    let supplyShock: string | null = null
    if (result.signal) {
      const gradeNum = parseGradeNum(result.signal.grade)
      const [cached, ctx] = await Promise.all([
        gradeNum !== null ? getCachedForecast(gradeNum) : Promise.resolve(null),
        getContextFactors(),
      ])
      signalForecast7d  = cached?.[6]?.price  ?? null
      signalForecast14d = cached?.[13]?.price ?? null
      demandShock = ctx.demand_shock ?? null
      supplyShock = ctx.supply_shock ?? null
    }

    await Promise.all([
      saveMsg(user.id, "assistant", result.text, result.metadata ?? undefined),
      topic ? trackQuestion(message, topic) : Promise.resolve(),
      result.profileUpdate ? upsertAiProfile(user.id, result.profileUpdate as Partial<AiProfile>) : Promise.resolve(),
      result.signal
        ? saveSignal(user.id, {
            action: result.signal.action,
            grade: result.signal.grade,
            quantity: result.signal.quantity,
            confidence: result.signal.confidence,
            context: result.signal.context,
            price_at_signal: result.signal.last_price ?? null,
            forecast_7d:  signalForecast7d,
            forecast_14d: signalForecast14d,
            demand_shock: demandShock,
            supply_shock: supplyShock,
          })
        : Promise.resolve(),
    ])

    return NextResponse.json(result)
  } catch (e) {
    const err = e as { status?: number; message?: string }
    const status  = err.status
    const errMsg  = err.message ?? String(e)
    console.error("[api/agent] status=%s msg=%s", status, errMsg)

    const isRateLimit = status === 429 || errMsg.includes("429")
    const text = isRateLimit
      ? "ระบบกำลังยุ่งมากครับ กรุณารอ 30 วินาทีแล้วลองใหม่ | Too many requests — please wait 30 seconds and try again."
      : "เกิดข้อผิดพลาดชั่วคราวครับ กรุณาลองใหม่อีกครั้ง | Temporary error — please try again."

    return NextResponse.json({
      text,
      metadata: null,
      signal: null,
      suggestedQuestions: null,
      profileUpdate: null,
    })
  }
}
