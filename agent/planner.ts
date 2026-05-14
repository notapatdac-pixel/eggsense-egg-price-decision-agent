import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export interface PlannerOutput {
  intent: string        // price_check | forecast | buying_advice | market_news | inventory | cost_analysis | profile_collection | general
  specialist: string    // price | forecast | buying | news | inventory | general
  tools_needed: string[]
  context_hint: string
}

const SYSTEM = `You are a routing planner for EggSense — a Thai egg market AI advisor.
Analyze the user's message and select the best specialist agent plus tools needed.

Specialist agents:
- price      → current prices, grade comparison (tools: get_current_prices, get_market_context)
- forecast   → 14-day price prediction and signals (tools: get_price_forecast, get_market_context, get_market_news)
- buying     → buy/wait/partial-buy recommendation (tools: get_current_prices, get_price_forecast, calculate_inventory, get_market_context)
- news       → market news and factor analysis (tools: get_market_news, get_market_context)
- inventory  → stock optimization and cost calculation (tools: calculate_inventory, get_current_prices, get_price_forecast)
- general    → profile collection, general questions (all tools)

Respond with ONLY valid JSON, no markdown. Format:
{"intent":"<intent>","specialist":"<specialist>","tools_needed":["<tool1>"],"context_hint":"<one sentence guidance>"}

Intents: price_check, forecast, buying_advice, market_news, inventory, cost_analysis, profile_collection, general`

export async function runPlanner(message: string): Promise<PlannerOutput> {
  const DEFAULT: PlannerOutput = { intent: "general", specialist: "general", tools_needed: [], context_hint: "" }
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM,
      generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
    })
    const result = await Promise.race([
      model.generateContent(`User message: ${message}`),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("planner timeout")), 5000)),
    ])
    const text = (result as Awaited<ReturnType<typeof model.generateContent>>).response.text().trim()
    const m = text.match(/\{[\s\S]*\}/)
    if (m) {
      const parsed = JSON.parse(m[0]) as Partial<PlannerOutput>
      // Derive specialist from intent if planner omits it
      if (!parsed.specialist && parsed.intent) {
        const intentMap: Record<string, string> = {
          price_check: "price", forecast: "forecast", buying_advice: "buying",
          market_news: "news", inventory: "inventory", cost_analysis: "inventory",
          profile_collection: "general", general: "general",
        }
        parsed.specialist = intentMap[parsed.intent] ?? "general"
      }
      return { ...DEFAULT, ...parsed }
    }
  } catch {
    // Planner failure is non-fatal — executor proceeds without hints
  }
  return DEFAULT
}
