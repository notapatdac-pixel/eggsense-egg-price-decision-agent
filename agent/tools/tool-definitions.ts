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
    description: "Get 14-day egg price forecast. Returns price_now, price_7d, price_14d, change_7d_pct, change_14d_pct, and market_signals: { market_trend_pct_per_day, oil_momentum_pct, feed_momentum_pct, temp_state, disease_active, demand_shock, supply_shock, news_sentiment ('bullish'|'neutral'|'bearish'), top_news }. Use change_7d_pct and change_14d_pct to state price direction, then use market_signals to reason WHY. Never quote raw field names or signal scores to the user.",
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
