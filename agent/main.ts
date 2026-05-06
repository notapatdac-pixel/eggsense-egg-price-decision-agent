import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration, type Content } from "@google/generative-ai"
import {
  getAllGradesLatest,
  getLatestEggPrice,
  getCachedNews,
  getContextFactors,
  getOffset,
  upsertAiProfile,
  saveSignal,
} from "@/lib/db"
import type { AiProfile, AgentResult, Grade, ChatMessage } from "@/lib/types"
import { computeForecast } from "@/agent/tools/forecast"
import { buildPrompt } from "@/agent/prompts/system"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// -- Tool declarations -----------------------------------------

const TOOLS: FunctionDeclaration[] = [
  {
    name: "get_current_prices",
    description: "Get live DIT egg prices for all grades or one specific grade.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        grade: { type: SchemaType.INTEGER, description: "-1 for all grades, 0-5 for one grade" },
      },
      required: ["grade"],
    },
  },
  {
    name: "get_price_forecast",
    description: "Get 14-day egg price forecast using trend, oil, weather, feed costs, and disease data.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        grade: { type: SchemaType.INTEGER, description: "Egg grade 0-5" },
      },
      required: ["grade"],
    },
  },
  {
    name: "get_market_news",
    description: "Get latest news affecting Thai egg prices (oil, war, weather, disease, feed costs).",
    parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
  },
  {
    name: "calculate_inventory",
    description: "Calculate optimal purchase quantity given current stock and daily usage.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        current_stock: { type: SchemaType.INTEGER },
        daily_usage: { type: SchemaType.INTEGER },
        days_to_cover: { type: SchemaType.INTEGER },
        current_price: { type: SchemaType.NUMBER },
        forecast_price_7d: { type: SchemaType.NUMBER },
      },
      required: ["current_stock", "daily_usage", "days_to_cover", "current_price"],
    },
  },
  {
    name: "get_market_context",
    description: "Get current weather temperature, feed costs (corn+soybean), and disease status.",
    parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
  },
]

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
      const fc = await computeForecast(g, 14, off(g))
      return { grade: g, forecast_14d: fc, price_7d: fc[6]?.price, price_14d: fc[13]?.price, offset_applied: off(g) }
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

// -- Main loop -------------------------------------------------

export async function runAgentTurn(
  userId: string,
  message: string,
  history: ChatMessage[],
  profile: AiProfile | null,
  rag: string[]
): Promise<AgentResult> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: buildPrompt(profile, rag),
    tools: [{ functionDeclarations: TOOLS }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  })

  const gemHist: Content[] = history.slice(-12).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))

  const chat = model.startChat({ history: gemHist })
  let resp = await chat.sendMessage(message)

  interface InventoryResult {
    days_left: number
    recommended_purchase: number
    estimated_savings: number
    buy_now_saves: boolean
    reasoning: string
  }
  let inventoryCard: InventoryResult | null = null

  // Agentic tool-use loop (max 5 rounds)
  for (let i = 0; i < 5; i++) {
    const calls = resp.response.functionCalls()
    if (!calls?.length) break
    const results = await Promise.all(
      calls.map(async (call) => {
        const result = await exec(call.name, call.args as Record<string, unknown>, profile)
        if (call.name === "calculate_inventory") inventoryCard = result as InventoryResult
        return { functionResponse: { name: call.name, response: result } }
      })
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resp = await chat.sendMessage(results as any)
  }

  let text = resp.response.text()

  const out: AgentResult = { text, metadata: null, signal: null, suggestedQuestions: null, profileUpdate: null }

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
  out.signal = parseTag<AgentResult["signal"]>("signal")
  out.suggestedQuestions = parseTag<string[]>("suggested_questions")
  out.text = text.trim()

  // Auto-compute offsets for any newly collected personal prices
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

  // Surface inventory recommendation as chat card
  // Cast needed: TS 5.4+ flow-type treats closure-assigned let as its init value (null)
  const finalCard = inventoryCard as InventoryResult | null
  if (finalCard != null) {
    out.metadata = {
      type: "recommendation",
      recommended_units: finalCard.recommended_purchase,
      estimated_savings: finalCard.estimated_savings,
    }
  }

  if (out.profileUpdate) {
    await upsertAiProfile(userId, out.profileUpdate as Partial<AiProfile>)
  }
  if (out.signal) {
    await saveSignal(userId, {
      action: out.signal.action,
      grade: out.signal.grade,
      quantity: out.signal.quantity,
      confidence: out.signal.confidence,
      context: out.signal.context,
    })
  }

  return out
}
