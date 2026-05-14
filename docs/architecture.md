# EggSense — Architecture

## System Overview

AI-powered egg price intelligence platform for Thai food businesses. Provides real-time DIT prices, 14-day forecasts, market news, and personalized purchasing recommendations via a Gemini-powered agent.

## Folder Structure

```
eggsense-egg-price-decision-agent/
├── agent/                             ← core agent code
│   ├── main.ts                        ← entry point: runAgentTurn()
│   ├── tools/
│   │   ├── tool-definitions.ts        ← Gemini FunctionDeclaration[] array
│   │   ├── price-forecaster.ts        ← computeForecast(), generateSignal()
│   │   └── knowledge-retriever.ts     ← embedText(), retrieveContext(), embedDailyPrices()
│   └── prompts/
│       └── egg-advisor-prompt.ts      ← buildPrompt() system prompt builder
├── app/                               ← Next.js 16 App Router (UI + API)
│   ├── login/ | register/             ← Supabase Auth pages
│   ├── overview/ | ai-agent/ | business-profile/  ← Protected dashboard pages
│   ├── pages/                         ← Client components (OverviewPage, ProfilePage, etc.)
│   ├── api/agent/                     ← POST /api/agent — agent chat endpoint
│   ├── api/forecast/                  ← GET  /api/forecast — price forecast
│   ├── api/prices/                    ← GET  /api/prices — live grade prices
│   ├── api/news/                      ← GET  /api/news — market news
│   └── api/cron/                      ← 6 daily cron jobs (oil/weather/eggs/feed/disease/embed)
├── components/                        ← UI components (charts, cards, sidebar)
├── lib/
│   ├── types.ts                       ← shared TypeScript types
│   ├── db/                            ← Supabase service client (domain modules)
│   │   ├── index.ts                   ← barrel re-exports (all "@/lib/db" imports resolve here)
│   │   ├── client.ts                  ← db(), today(), ago() helpers
│   │   ├── prices.ts                  ← egg price functions
│   │   ├── oil.ts                     ← oil price functions
│   │   ├── profile.ts                 ← user & AI profile functions
│   │   ├── conversations.ts           ← loadHistory(), saveMsg()
│   │   ├── signals.ts                 ← saveSignal()
│   │   ├── news.ts                    ← getCachedNews(), saveNewsCache()
│   │   ├── forecast-cache.ts          ← getCachedForecast(), saveForecastCache()
│   │   ├── cron.ts                    ← logCron()
│   │   └── alerts.ts                  ← checkAlerts()
│   └── supabase/                      ← Supabase SSR client (client.ts + server.ts)
├── data/
│   ├── raw/                           ← source datasets
│   └── scripts/                       ← data fetch / generation scripts
├── docs/
│   └── architecture.md                ← this file
├── notebooks/                         ← EDA / prototyping notebooks
└── proxy.ts                           ← Next.js 16 auth proxy (replaces middleware.ts)
```

## Agent Flow

```
User message
    │
    ▼
POST /api/agent
    │
    ├── loadHistory()      ← last 20 messages from ai_conversations
    ├── getAiProfile()     ← user profile + price offsets
    └── retrieveContext()  ← RAG: top-4 matching docs from pgvector
    │
    ▼
runAgentTurn()  [agent/main.ts]
    │
    ├── buildPrompt()      ← system prompt + progressive profiling state
    ├── Gemini 2.5 Flash   ← with function calling (5 tool rounds max)
    │   ├── get_current_prices   → getLatestEggPrice() / getAllGradesLatest()
    │   ├── get_price_forecast   → computeForecast() [agent/tools/price-forecaster.ts]
    │   ├── get_market_news      → getCachedNews()
    │   ├── calculate_inventory  → inline calculation
    │   └── get_market_context   → getContextFactors()
    └── parse tags: <profile_update> <signal> <suggested_questions>
    │
    ▼
Save to Supabase: ai_conversations, ai_user_profile, agent_signals
```

## Forecast Algorithm

Linear regression (least squares) on 60-day price history, with additive adjustments:

| Factor | Source column | Weight |
|--------|--------------|--------|
| Oil price trend | diesel_price_thb | +0.25% per 1% Δ |
| Hot weather >35°C | avg_temp_celsius | +0.02 per °C above 35 |
| Cold weather <20°C | avg_temp_celsius | +0.01 per °C below 20 |
| Corn expensive | corn_price_thb | +0.15% per ฿1 above ฿11/kg |
| Soybean expensive | soybean_meal_price_thb | +0.10% per ฿1 above ฿17/kg |
| Disease active | disease_status | +8% supply shock |
| Disease contained | disease_status | +3% residual |
| Weekend | day-of-week | −1.5% Sat/Sun |
| Weekday | day-of-week | +0.8% |
| User offset | ai_user_profile | flat addition per grade |

## Cron Jobs (Bangkok time = UTC+7)

| Time BKK | UTC cron | Endpoint | Writes to |
|----------|----------|----------|-----------|
| 00:00 | 0 17 * * * | /api/cron/oil | bangchak_oil_prices |
| 00:30 | 30 17 * * * | /api/cron/weather | egg_price_daily.avg_temp |
| 01:00 | 0 18 * * * | /api/cron/eggs | egg_price_daily all grades |
| 01:30 | 30 18 * * * | /api/cron/feedcosts | egg_price_daily.corn+soybean |
| 02:00 | 0 19 * * * | /api/cron/disease | egg_price_daily.disease_* |
| 02:30 | 30 19 * * * | /api/cron/embed | rag_embeddings |

## Tech Stack

- **Framework**: Next.js 16 App Router + TypeScript
- **Styling**: Tailwind CSS v4 + DM Sans (next/font/google)
- **Charts**: Recharts (ComposedChart)
- **Database**: Supabase PostgreSQL + pgvector
- **Auth**: Supabase Auth (email/password)
- **AI Agent**: Google Gemini 2.5 Flash (function calling)
- **Embeddings**: Gemini text-embedding-004 (768-dim)
- **RAG**: Supabase pgvector + match_rag_documents()
- **News**: Tavily Search API
- **Deploy**: Vercel (cron via vercel.json)
