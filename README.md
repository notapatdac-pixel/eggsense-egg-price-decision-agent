# EggSense — AI Egg Price Decision Agent

> **MADT7204 Vibe Coding Project** · Team 1 · Bangkok Oil Price Crisis

Thai food businesses are caught in a squeeze: diesel prices hit record highs, raising transport and farm energy costs, which pushes egg prices up unpredictably. EggSense is an agentic AI advisor that monitors live DIT egg prices, tracks fuel and feed cost trends, and tells food businesses exactly **when to buy, how much to stock, and why prices are moving** — in plain Thai.

---

## Team

| Student ID | Name | Role |
|------------|------|------|
| 6810424021 | Notapat Dachanabhirom | **IT Lead** |
| 6810414002 | Nittakarn Ratapisanpong | Mgmt Member |
| 6810424006 | Apisit Rattanasangsan | Mgmt Member |
| 6810424007 | Chanwit Sangsri | Mgmt Member |
| 6810424013 | Narongrit Bureeruk | Mgmt Member |
| 6810424026 | Bhumin Thiewsungnoen | Mgmt Member |

---

## Problem Statement

When diesel prices spike, the cost ripple reaches Thai egg farms within days — higher transport costs, higher energy bills for temperature-controlled henhouses, and rising corn and soybean feed costs (priced in USD and amplified by Baht weakness). A Bangkok bakery or restaurant buying 200–500 eggs a day absorbs these swings silently: they have no way to know whether today's price is a peak or the start of a longer rise, or whether stocking up now would save them ฿1,200 this month.

EggSense closes this gap. It connects diesel prices, feed cost futures, weather data, and disease alerts to DIT wholesale egg prices, then uses an AI agent to translate that into a simple BUY / HOLD / WAIT recommendation personalised to each business's grade, volume, and supplier region.

---

## Agent Architecture

EggSense is built on a **multi-agent pattern**: a lightweight Planner Agent routes each question to one of five Specialist Agents, each with a distinct system prompt and restricted tool set.

```
User message → POST /api/agent
    ├── RAG retrieval       pgvector similarity search (top-4 docs)
    ├── Planner Agent       Gemini 2.5 Flash (temp=0.1) — classifies intent,
    │                       selects specialist, passes context hint
    └── Specialist Agent    Gemini 2.5 Flash (temp=0.7) — tool-use loop
            ├── 💰 Price Analyst      get_current_prices · get_market_context
            ├── 📈 Forecast Analyst   get_price_forecast · get_market_context · get_market_news
            ├── 🛒 Buying Advisor     get_current_prices · get_price_forecast · calculate_inventory · get_market_context
            ├── 📰 Market Intelligence get_market_news · get_market_context
            └── 📦 Inventory Optimizer calculate_inventory · get_current_prices · get_price_forecast
```

### Tools (5 dynamic tools)

| Tool | What it does |
|------|-------------|
| `get_current_prices(grade)` | Live DIT wholesale price for grades G0–G5, with user's personal price offset applied |
| `get_price_forecast(grade)` | 14-day Holt-Winters forecast + market signals (oil momentum, feed momentum, temp state, disease) |
| `get_market_news()` | Latest egg-market news from Tavily, categorised by impact type |
| `calculate_inventory(stock, usage, days, price)` | Optimal purchase quantity and estimated savings vs waiting |
| `get_market_context()` | Current temperature, diesel price, corn/soybean cost, disease status, demand/supply shocks |

### Agentic Features

| Feature | Implementation |
|---------|---------------|
| **Multi-agent** | Planner routes to specialist; each specialist has distinct system prompt + tool whitelist |
| **RAG** | `pgvector` (768-dim Gemini embeddings) searched via `match_rag_documents()` RPC before each turn |
| **Memory** | Last 12 conversation turns loaded from Supabase as Gemini chat history; AI-learned user profile persists across sessions |
| **Agentic loop** | Tool errors trigger automatic retry (800ms delay); `fallback_hint` injected so model adapts gracefully |
| **Reasoning transparency** | Expandable reasoning panel in UI shows specialist agent, session memory count, and each tool call with result summary |

### Forecast Model

**Holt-Winters Double Exponential Smoothing** with Bayesian-blended factor weights learned from historical data:

- Shared market trend from all-grade average (`avg_egg_price`), grade-specific spread layered on top
- Factor adjustments: oil momentum (7-day lag), feed cost momentum (14-day lag), temperature premium/discount, disease supply shock, news sentiment
- Damped trend (φ=0.88) prevents unbounded linear extrapolation
- **Feedback loop:** each BUY/HOLD/WAIT signal saves its 7-day forecast; a daily cron fills in the actual price 7 days later and computes accuracy; the forecaster reads this bias history and applies a 30% damped correction on the next run

### Progressive User Profiling

The agent learns each user's business context through natural conversation — business type, preferred grade, daily usage, personal price, and supplier region. Profile data persists in Supabase and personalises every forecast and recommendation (price offset applied, ฿/day cost impact calculated for their volume).

---

## Data Sources

| Source | Data | URL / Endpoint | How used by agent |
|--------|------|----------------|-------------------|
| DIT — กรมการค้าภายใน | Egg wholesale prices G0–G5 (avg/min/max) | `https://data.moc.go.th/OpenData/GISProductPrice` | Queried daily by cron; stored in `egg_price_daily`; served by `get_current_prices` tool |
| Bangchak | Diesel / premium diesel pump prices (฿/L) | `https://www.bangchak.co.th` (HTML scrape) | Stored in `bangchak_oil_prices`; oil momentum signal feeds forecast model |
| Open-Meteo | Bangkok temperature (°C) | `https://api.open-meteo.com/v1/forecast` | Heat stress signal (>35°C → laying rate drop → price up) in forecast |
| Yahoo Finance | Corn (ZC=F) & soybean meal (ZM=F) futures | `https://finance.yahoo.com` (via yfinance) | Feed cost momentum signal; 14-day lag effect on egg prices |
| WHO RSS + Tavily | Disease outbreak news (avian influenza, poultry disease) | `https://www.who.int/feeds/entity/csr/don/en/rss.xml` + Tavily API | Supply shock signal; stored in `egg_price_daily.disease_status` |
| Tavily Search API | Egg-market news (oil, trade, weather, feed, disease, policy) | `https://api.tavily.com/search` | Categorised news served to agent via `get_market_news`; 6-hour cache |
| Gemini text-embedding-004 | RAG embeddings (768-dim) | Google AI Studio API | Daily price summaries + news articles embedded into `rag_embeddings` (pgvector) |

All raw data is fetched by scheduled cron jobs and stored in Supabase before the agent queries it — the agent never makes live external API calls during a user turn.

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- [Supabase](https://supabase.com) project (free tier works)
- [Google AI Studio](https://aistudio.google.com) API key (Gemini 2.5 Flash)
- [Tavily](https://tavily.com) API key

### 1. Clone & install

```bash
git clone <repo-url>
cd eggsense-egg-price-decision-agent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in all values
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `GEMINI_API_KEY` | Google AI Studio key |
| `TAVILY_API_KEY` | Tavily search key |
| `CRON_SECRET` | Random secret string to authenticate cron requests |
| `NEXT_PUBLIC_APP_URL` | Deployed URL (e.g. `https://your-app.vercel.app`) |

### 3. Set up Supabase

Run in Supabase **SQL Editor** in order:

```sql
-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create all tables (copy from supabase/schema.sql)
-- 3. Create RPC functions (copy from supabase/functions.sql)
-- 4. Apply Row Level Security (copy from supabase/rls.sql)

-- 5. Grant service_role access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
```

### 4. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

### 5. Seed initial data

Trigger cron jobs manually to populate the database (requires dev server running):

```bash
# Set CRON_SECRET in your shell first
export CRON_SECRET=your_secret

curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/oil
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/eggs
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/feedcosts
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/weather
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/disease
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/embed
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/news
```

### 6. Deploy to Vercel

Import the repo at [vercel.com](https://vercel.com), set all environment variables under **Settings → Environment Variables**, then push to `main`. Cron jobs run automatically per `vercel.json`.

---

## Vibe-Coding Tools

| Tool | Used for |
|------|---------|
| **Claude Code** (Anthropic) | Primary development tool — agent architecture, multi-agent planner/specialist design, Holt-Winters forecast model, database schema, all TypeScript implementation, debugging |
| **Claude claude-sonnet-4-6** | Prompt engineering for the egg advisor system prompt and specialist focus blocks |
| **v0 by Vercel** | Initial UI component scaffolding and layout prototyping |
| **GitHub Copilot** | Inline completions during active development sessions |

---

## Known Limitations

- **DIT scraper fragility** — DIT website structure changes without notice; scraper may break and fall back to the previous cached value.
- **Hobby-plan cron frequency** — on Vercel Hobby plan, news cron runs once daily (06:00 BKK) instead of every 15 minutes; news freshness is reduced.
- **Forecast is statistical, not ML** — Holt-Winters with learned factor weights; the model improves with accumulated signal accuracy data but does not use gradient-based learning.
- **RAG cold-start** — embeddings must be seeded via `/api/cron/embed` before RAG retrieval returns meaningful results.
- **National median prices only** — DIT prices are national medians; regional variation (e.g. Bangkok vs. Chiang Mai farm-gate prices) is approximated via user-reported personal price offsets.
- **Tavily quota** — free tier has a daily search limit; high traffic exhausts the quota and falls back to the 6-hour news cache.

## Future Improvements

- **LINE bot integration** — push BUY/HOLD/WAIT signals directly to users via LINE Notify when a price threshold is crossed
- **Regional price tracking** — aggregate farm-gate prices by province to give region-specific forecasts
- **ML forecast upgrade** — replace Holt-Winters with a lightweight time-series model (e.g. LSTM or Prophet) trained on accumulated signal accuracy data
- **Pitch deck** — see `/docs/pitch-deck.pdf`
- **Architecture diagram** — see `/docs/architecture.md`
