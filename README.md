# EggSense — AI Egg Price Decision Agent

**Team:** Team 1 | **Project slug:** eggsense-egg-price-decision-agent

| Role | Responsibility |
|------|---------------|
| AI/Agent Engineer | Gemini agent, tool definitions, RAG pipeline |
| Full-Stack Developer | Next.js UI, API routes, Supabase schema |
| Data Engineer | Cron scrapers (DIT, Bangchak, Open-Meteo, Yahoo Finance) |

---

## Problem Statement

Thai food businesses (bakeries, cafes, restaurants) face egg price volatility driven by oil prices, corn/soybean feed costs, weather, and disease outbreaks. The DIT (Department of Internal Trade) publishes daily median prices, but businesses have no tool to interpret *why* prices move or *when* to stock up. EggSense closes this gap with live data, a 14-day AI forecast, and a conversational agent that gives personalized buy/hold/wait recommendations.

---

## Agent Design

EggSense uses **Google Gemini 2.5 Flash** with native function calling in an agentic loop (up to 5 rounds per turn):

```
User message → POST /api/agent
    ├── RAG retrieval (pgvector, top-4 docs)
    ├── User profile + chat history from Supabase
    └── runAgentTurn() [agent/main.ts]
            ├── buildPrompt()  — system prompt with profile state + RAG context
            ├── Gemini 2.5 Flash  — function calling loop
            │   ├── get_current_prices    → live DIT prices
            │   ├── get_price_forecast    → 14-day regression forecast
            │   ├── get_market_news       → cached Tavily news
            │   ├── calculate_inventory  → optimal purchase quantity
            │   └── get_market_context   → temp, feed costs, disease status
            └── Tag parsing: <profile_update> <signal> <suggested_questions>
```

**Forecast algorithm:** Linear regression (least squares, 60-day history) with adjustments for oil price trend, temperature, corn/soybean costs, disease status, and day-of-week effects.

**Progressive profiling:** The agent collects 5 business fields (type, grade, daily usage, personal price, supplier region) one at a time — answering the user's question first, then appending the next missing field as a question.

---

## Data Sources

| Source | Data | Update frequency |
|--------|------|-----------------|
| DIT (กรมการค้าภายใน) | Thai egg prices G0–G5 (avg/min/max) | Daily 01:00 BKK |
| Bangchak | Diesel / premium diesel prices (฿/L) | Daily 00:00 BKK |
| Open-Meteo | Bangkok temperature (°C) | Daily 00:30 BKK |
| Yahoo Finance | Corn (ZC=F) & soybean meal (ZM=F) futures | Daily 01:30 BKK |
| WHO RSS + Tavily | Disease outbreak news | Daily 02:00 BKK |
| Tavily Search API | Market news (oil, war, weather, feed, disease) | On-demand, 6h cache |
| Gemini text-embedding-004 | RAG embeddings (768-dim, pgvector) | Daily 02:30 BKK |

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Google AI Studio](https://aistudio.google.com) API key (Gemini)
- A [Tavily](https://tavily.com) API key (news search)

### 1. Clone & install

```bash
git clone <repo-url>
cd eggsense-egg-price-decision-agent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in all values in .env.local
```

### 3. Set up Supabase

Run the SQL migrations in `data/scripts/` against your Supabase project (Dashboard → SQL Editor):

- `schema.sql` — tables: egg_price_daily, bangchak_oil_prices, users, ai_user_profile, ai_conversations, agent_signals, news_cache, forecast_cache, rag_embeddings, price_alerts, cron_log
- `functions.sql` — `match_rag_documents()` pgvector RPC

Enable **Row Level Security** and apply policies from `data/scripts/rls.sql`.

### 4. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

### 5. Seed initial data (optional)

```bash
# Trigger cron jobs manually to populate the DB
curl -H "x-cron-secret: <CRON_SECRET>" http://localhost:3000/api/cron/eggs
curl -H "x-cron-secret: <CRON_SECRET>" http://localhost:3000/api/cron/oil
curl -H "x-cron-secret: <CRON_SECRET>" http://localhost:3000/api/cron/weather
curl -H "x-cron-secret: <CRON_SECRET>" http://localhost:3000/api/cron/feedcosts
curl -H "x-cron-secret: <CRON_SECRET>" http://localhost:3000/api/cron/disease
curl -H "x-cron-secret: <CRON_SECRET>" http://localhost:3000/api/cron/embed
```

### 6. Deploy to Vercel

```bash
vercel --prod
# Set all .env.local values as Vercel environment variables
# Cron jobs are configured in vercel.json
```

---

## Vibe-Coding Tools

Built with AI-assisted development:

- **Claude Code** (Anthropic) — architecture planning, full-stack implementation, TypeScript debugging
- **v0 by Vercel** — initial UI component scaffolding
- **GitHub Copilot** — inline completions during development

---

## Known Limitations

- **DIT scraper is fragile** — the DIT website HTML structure changes without notice; the scraper may break and fall back to mock data.
- **Forecast is statistical, not ML** — linear regression with fixed weights; does not learn from new data over time.
- **RAG cold-start** — embeddings must be seeded via `/api/cron/embed` before RAG retrieval returns useful results.
- **Tavily news quota** — free tier is limited; high traffic will exhaust the daily quota and fall back to the 6-hour news cache.
- **Single-region** — prices are national DIT medians; regional price variation (e.g., Bangkok vs. Chiang Mai) is approximated via user-reported personal price offsets only.
- **Thai language** — agent responds in Thai when the user writes Thai, but underlying data labels are in English.
- **Rename root folder** — rename the project root to `team-[N]-eggsense` before final submission (cannot be done programmatically while the dev server is running).
