import { TOOLS } from "@/agent/tools/tool-definitions"
import type { FunctionDeclaration } from "@google/generative-ai"

export interface SpecialistDef {
  key: string
  displayName: string
  icon: string
  allowedTools: string[]
  focusBlock: string
  temperature: number
}

// Each specialist is a distinct agent with its own system instructions and tool access.
// The Planner Agent selects which specialist handles each user turn.
export const SPECIALISTS: Record<string, SpecialistDef> = {
  price: {
    key: "price",
    displayName: "Price Analyst",
    icon: "💰",
    temperature: 0.3,
    allowedTools: ["get_current_prices", "get_market_context"],
    focusBlock: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST: PRICE ANALYST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are acting as the EggSense Price Analyst.
Your exclusive focus: deliver accurate, up-to-date egg price information.
Required workflow:
1. Call get_current_prices (use grade=-1 to show all grades if no grade specified).
2. Call get_market_context to identify 1-2 drivers behind the current price level.
3. Lead with the exact price number, then explain drivers in 1-2 sentences.
4. If user has a price offset, compare their personal price vs DIT average explicitly.`,
  },

  forecast: {
    key: "forecast",
    displayName: "Forecast Analyst",
    icon: "📈",
    temperature: 0.4,
    allowedTools: ["get_price_forecast", "get_market_context", "get_market_news"],
    focusBlock: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST: FORECAST ANALYST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are acting as the EggSense Forecast Analyst.
Your exclusive focus: 14-day price outlook with clear signal reasoning.
Required workflow:
1. Call get_price_forecast for the relevant grade.
2. Call get_market_context and get_market_news to explain the forecast signals.
3. Present: current price → 7-day → 14-day with % change direction.
4. Name the 2-3 strongest signals (disease, oil, feed, weather) driving the outlook.
Calibration note: Thai egg prices are sticky — forecast change >3% over 14 days requires
a genuine shock (disease outbreak, major oil spike). Express confidence proportionally.`,
  },

  buying: {
    key: "buying",
    displayName: "Buying Advisor",
    icon: "🛒",
    temperature: 0.35,
    allowedTools: ["get_current_prices", "get_price_forecast", "calculate_inventory", "get_market_context"],
    focusBlock: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST: BUYING ADVISOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are acting as the EggSense Buying Advisor.
Your exclusive focus: give a concrete, justified buy/wait recommendation.
Required workflow:
1. Get current prices and 7-14 day forecast.
2. Run calculate_inventory if user has shared stock on hand and daily usage.
3. Deliver a clear verdict: BUY NOW / WAIT / PARTIAL BUY with ฿ savings rationale.
4. If you lack stock or usage data, give a conditional best-guess recommendation,
   then ask for ONE missing data point (don't run calculate_inventory with guesses).`,
  },

  news: {
    key: "news",
    displayName: "Market Intelligence",
    icon: "📰",
    temperature: 0.5,
    allowedTools: ["get_market_news", "get_market_context"],
    focusBlock: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST: MARKET INTELLIGENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are acting as the EggSense Market Intelligence agent.
Your exclusive focus: news impact analysis on Thai egg prices.
Required workflow:
1. Call get_market_news and get_market_context together.
2. Group findings by price impact: 🔴 HIGH / 🟡 MEDIUM / 🟢 LOW.
3. For each HIGH item: what happened → expected price direction → supply chain reasoning.
4. Always trace the mechanism: oil → transport/energy → egg price timeline.`,
  },

  inventory: {
    key: "inventory",
    displayName: "Inventory Optimizer",
    icon: "📦",
    temperature: 0.35,
    allowedTools: ["calculate_inventory", "get_current_prices", "get_price_forecast", "get_market_context"],
    focusBlock: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIST: INVENTORY OPTIMIZER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are acting as the EggSense Inventory Optimizer.
Your exclusive focus: stock level optimization and cost calculation.
Required workflow:
1. Get current prices and 14-day forecast first.
2. Run calculate_inventory — ask for daily_usage or current_stock if not already known.
3. Always output: days of stock remaining, recommended purchase quantity, estimated savings.
4. Give an action statement: "Buy X units by [day] to save ฿Y vs waiting."`,
  },

  general: {
    key: "general",
    displayName: "General Advisor",
    icon: "🤖",
    temperature: 0.7,
    allowedTools: [
      "get_current_prices",
      "get_price_forecast",
      "get_market_news",
      "calculate_inventory",
      "get_market_context",
    ],
    focusBlock: "",
  },
}

export function getSpecialist(key: string | undefined): SpecialistDef {
  if (!key) return SPECIALISTS.general
  return SPECIALISTS[key] ?? SPECIALISTS.general
}

export function getSpecialistTools(key: string | undefined): FunctionDeclaration[] {
  const spec = getSpecialist(key)
  return TOOLS.filter((t) => spec.allowedTools.includes(t.name))
}
