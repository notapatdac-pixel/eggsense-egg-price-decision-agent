import { GoogleGenerativeAI, type Content } from "@google/generative-ai"
import {
  getAllGradesLatest,
  getLatestEggPrice,
  getCachedNews,
  getContextFactors,
  getOffset,
} from "@/lib/db"
import type { AiProfile, AgentResult, Grade, ChatMessage, ToolCall } from "@/lib/types"
import { computeForecastWithSignals } from "@/agent/tools/price-forecaster"
import { buildPrompt } from "@/agent/prompts/egg-advisor-prompt"
import { getSpecialistTools } from "@/agent/specialists"
import type { PlannerOutput } from "@/agent/planner"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const MODEL = "gemini-2.5-flash"

// Retries transient errors (503, network) within the same model before giving up.
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const msg    = String((e as { message?: string }).message ?? e)
      const status = (e as { status?: number }).status
      const retryable = status === 503 || msg.includes("503")   // 429 is handled by model fallback
      if (attempt === retries || !retryable) throw e
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1500))
    }
  }
  throw new Error("Max retries exceeded")
}

// -- Tool execution --------------------------------------------

async function exec(name: string, args: Record<string, unknown>, profile: AiProfile | null): Promise<unknown> {
  const off = (g: number) => parseFloat(String((profile as unknown as Record<string, unknown>)?.[`price_offset_g${g}`] ?? 0)) || 0
  try {
    if (name === "get_current_prices") {
      const g = args.grade as number
      if (g === -1) {
        const prices = await getAllGradesLatest()
        return prices.map((p) => ({
          grade: p.grade,
          name: p.name,
          dit_avg: p.avg,
          change_pct: p.changePct,
          user_price: Math.round((p.avg + off(p.grade)) * 100) / 100,
        }))
      }
      const avg = await getLatestEggPrice(g as Grade)
      return { grade: g, dit_avg: avg, user_price: Math.round((avg + off(g)) * 100) / 100 }
    }
    if (name === "get_price_forecast") {
      const g = args.grade as Grade
      const { forecast, signals } = await computeForecastWithSignals(g, 14, off(g))
      const p0 = forecast[0]?.price ?? null
      const p7 = forecast[6]?.price ?? null
      const p14 = forecast[13]?.price ?? null
      return {
        grade: g,
        price_now:  p0,
        price_7d:   p7,
        price_14d:  p14,
        change_7d_pct:  p0 && p7  ? Math.round(((p7  - p0) / p0) * 1000) / 10 : null,
        change_14d_pct: p0 && p14 ? Math.round(((p14 - p0) / p0) * 1000) / 10 : null,
        offset_applied: off(g),
        market_signals: signals,
      }
    }
    if (name === "get_market_news") {
      const news = await getCachedNews("general", 5)
      return news.map((n) => ({ title: n.title, category: n.category, source: n.source, time: n.time_ago_label }))
    }
    if (name === "calculate_inventory") {
      const { current_stock: cs, daily_usage: du, days_to_cover: dc, current_price: cp, forecast_price_7d } = args as {
        current_stock: number
        daily_usage: number
        days_to_cover: number
        current_price: number
        forecast_price_7d?: number
      }
      const fc7 = forecast_price_7d ?? cp * 1.03
      const to_buy = Math.max(0, du * dc - cs)
      const savings = Math.round((fc7 - cp) * to_buy * 100) / 100
      return {
        days_left: Math.round((cs / du) * 10) / 10,
        recommended_purchase: to_buy,
        estimated_savings: savings,
        buy_now_saves: savings > 0,
        reasoning: `${cs} units = ${Math.round((cs / du) * 10) / 10} days. Buy ${to_buy} now, saves ฿${savings} vs waiting.`,
      }
    }
    if (name === "get_market_context") return await getContextFactors()
  } catch (e) {
    return { error: String(e) }
  }
  return { error: `Unknown tool: ${name}` }
}

// -- Tool result summariser (for Reasoning display) ------------

function summariseTool(name: string, args: Record<string, unknown>, result: unknown): string {
  if (!result || typeof result !== "object") return "No data"
  const r = result as Record<string, unknown>
  switch (name) {
    case "get_current_prices": {
      if (Array.isArray(r.items)) {
        const items = r.items as Array<{ grade: number; dit_avg: number }>
        return `All ${items.length} grades — G2 avg ฿${items.find((i) => i.grade === 2)?.dit_avg ?? "—"}`
      }
      return `Grade ${r.grade}: DIT ฿${r.dit_avg}`
    }
    case "get_price_forecast": {
      const ch = r.change_7d_pct as number | null
      const dir = ch == null ? "" : ch > 0 ? ` (+${ch}% in 7d)` : ch < 0 ? ` (${ch}% in 7d)` : " (stable)"
      return `Grade ${r.grade}: ฿${r.price_now} now → ฿${r.price_7d} (7d) → ฿${r.price_14d} (14d)${dir}`
    }
    case "get_market_news": {
      const items = Array.isArray(r.items) ? r.items as Array<{ category: string }> : []
      const cats = [...new Set(items.map((i) => i.category))].filter(Boolean).join(", ")
      return `${items.length} articles — ${cats || "general"}`
    }
    case "calculate_inventory":
      return `${r.days_left}d stock left — buy ${r.recommended_purchase} units, saves ฿${r.estimated_savings}`
    case "get_market_context": {
      const ctx = r as { avg_temp_celsius?: number; corn_price_thb?: number; disease_status?: string }
      return `Temp ${ctx.avg_temp_celsius ?? "—"}°C | Corn ฿${ctx.corn_price_thb ?? "—"}/kg | Disease: ${ctx.disease_status ?? "—"}`
    }
    default:
      return JSON.stringify(result).slice(0, 80)
  }
}

// -- Core chat loop (single model attempt) ----------------------

interface InventoryResult {
  days_left: number
  recommended_purchase: number
  estimated_savings: number
  buy_now_saves: boolean
  reasoning: string
}

async function runWithModel(
  modelId: string,
  gemHist: Content[],
  message: string,
  profile: AiProfile | null,
  rag: string[],
  planner?: PlannerOutput,
  historyCount?: number
): Promise<AgentResult> {
  // Route to the specialist's restricted tool set — each specialist is a distinct agent
  const specialistTools = getSpecialistTools(planner?.specialist)

  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: buildPrompt(profile, rag, planner),
    tools: [{ functionDeclarations: specialistTools }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  })

  const chat = model.startChat({ history: gemHist })
  let resp = await withRetry(() => chat.sendMessage(message))

  let inventoryCard: InventoryResult | null = null
  const toolTrace: ToolCall[] = []

  // Agentic tool-use loop (max 5 rounds)
  for (let i = 0; i < 5; i++) {
    const calls = resp.response.functionCalls()
    if (!calls?.length) break
    const results = await Promise.all(
      calls.map(async (call) => {
        let result = await exec(call.name, call.args as Record<string, unknown>, profile)
        const isError = result != null && typeof result === "object" && "error" in (result as object)

        // Agentic retry: on transient tool error, retry once after a short delay
        if (isError) {
          await new Promise((r) => setTimeout(r, 800))
          const retried = await exec(call.name, call.args as Record<string, unknown>, profile)
          const stillError = retried != null && typeof retried === "object" && "error" in (retried as object)
          if (!stillError) result = retried
        }

        const finalError = result != null && typeof result === "object" && "error" in (result as object)
        if (call.name === "calculate_inventory" && !finalError) inventoryCard = result as InventoryResult

        // Capture for Reasoning trace — mark failed tools
        toolTrace.push({
          tool: call.name,
          summary: summariseTool(call.name, call.args as Record<string, unknown>, result),
          failed: finalError,
        })

        // On persistent error, give model a fallback hint so it can adapt
        const response = finalError
          ? {
              ...(result as Record<string, unknown>),
              fallback_hint: "Tool unavailable. Use available context data or market knowledge to answer without this source.",
            }
          : Array.isArray(result)
            ? { items: result }
            : (result as Record<string, unknown>)

        return { functionResponse: { name: call.name, response } }
      })
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resp = await withRetry(() => chat.sendMessage(results as any))
  }

  let text = resp.response.text()

  const out: AgentResult = {
    text,
    metadata: null,
    signal: null,
    suggestedQuestions: null,
    profileUpdate: null,
    toolTrace: toolTrace.length > 0 ? toolTrace : null,
    plannerIntent: planner?.intent ?? null,
    specialist: planner?.specialist ?? null,
    historyCount: historyCount ?? 0,
  }

  const parseTag = <T>(tag: string): T | null => {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
    if (!m) return null
    try {
      text = text.replace(m[0], "").trim()
      return JSON.parse(m[1].trim()) as T
    } catch {
      return null
    }
  }

  out.profileUpdate = parseTag<Partial<AiProfile>>("profile_update")
  out.signal        = parseTag<AgentResult["signal"]>("signal")
  out.suggestedQuestions = parseTag<string[]>("suggested_questions")
  out.text = text.trim()

  if (out.profileUpdate) {
    for (let g = 0; g <= 5; g++) {
      const pk = `personal_price_g${g}` as keyof AiProfile
      if (out.profileUpdate[pk] != null) {
        const dit = await getLatestEggPrice(g as Grade)
        ;(out.profileUpdate as Record<string, unknown>)[`price_offset_g${g}`] =
          Math.round((parseFloat(String(out.profileUpdate[pk])) - dit) * 10000) / 10000
      }
    }
  }

  if (inventoryCard != null) {
    const card = inventoryCard as InventoryResult
    out.metadata = {
      type: "recommendation",
      recommended_units: card.recommended_purchase,
      estimated_savings: card.estimated_savings,
    }
  }

  return out
}

// -- Main entry point ------------------------------------------

export async function runAgentTurn(
  userId: string,
  message: string,
  history: ChatMessage[],
  profile: AiProfile | null,
  rag: string[],
  planner?: PlannerOutput
): Promise<AgentResult> {
  // Gemini requires history to start with a 'user' turn.
  const raw: Content[] = history.slice(-12).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))
  const firstUser = raw.findIndex((m) => m.role === "user")
  const gemHist   = firstUser === -1 ? [] : firstUser > 0 ? raw.slice(firstUser) : raw

  return runWithModel(MODEL, gemHist, message, profile, rag, planner, gemHist.length)
}
