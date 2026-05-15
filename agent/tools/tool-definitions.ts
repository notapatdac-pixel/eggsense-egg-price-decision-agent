import { SchemaType, type FunctionDeclaration } from "@google/generative-ai"

export const TOOLS: FunctionDeclaration[] = [
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
    description: "Get 14-day egg price forecast. Returns: dit_price_today (official DIT price from DB — use this as 'DIT today'), your_price_today (user's actual purchase price = DIT + their supplier offset, null if no offset set), your_forecast_price_7d and your_forecast_price_14d (user's expected prices including supplier offset), change_7d_pct, change_14d_pct, and market_signals. IMPORTANT: dit_price_today is the official DIT — always use this when saying 'ราคา DIT วันนี้'. your_price_today is what the user actually pays. Never confuse the two. Use change_7d_pct and change_14d_pct to state price direction, then use market_signals to reason WHY.",
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
