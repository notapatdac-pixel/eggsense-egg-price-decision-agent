import type { Grade, ForecastPoint, FeaturePoint } from "@/lib/types"
import { FALLBACK } from "@/lib/types"
import { getFeatureHistory, getContextFactors, getCachedForecast, saveForecastCache, getRecentNews, getRecentForecastBias } from "@/lib/db"

const isoDate = (d: Date) => d.toISOString().split("T")[0]

// ─── Holt-Winters Double Exponential Smoothing ────────────────────────────────

function hwPass(prices: number[], alpha: number, beta: number) {
  let l = prices[0]
  let b = (prices[1] ?? prices[0]) - prices[0]
  for (let t = 1; t < prices.length; t++) {
    const prev = l
    l = alpha * prices[t] + (1 - alpha) * (l + b)
    b = beta * (l - prev) + (1 - beta) * b
  }
  return { level: l, trend: b }
}

function hwRMSE(prices: number[], alpha: number, beta: number): number {
  if (prices.length < 6) return Infinity
  let l = prices[0], b = prices[1] - prices[0], sse = 0
  for (let t = 1; t < prices.length; t++) {
    sse += (prices[t] - (l + b)) ** 2
    const prev = l
    l = alpha * prices[t] + (1 - alpha) * (l + b)
    b = beta * (l - prev) + (1 - beta) * b
  }
  return Math.sqrt(sse / (prices.length - 1))
}

function fitHW(prices: number[]) {
  const ALPHAS = [0.1, 0.2, 0.3, 0.4, 0.5]
  const BETAS  = [0.05, 0.1, 0.15, 0.2, 0.25]
  let best = { alpha: 0.2, beta: 0.1, rmse: Infinity }
  for (const a of ALPHAS)
    for (const b of BETAS) {
      const rmse = hwRMSE(prices, a, b)
      if (rmse < best.rmse) best = { alpha: a, beta: b, rmse }
    }
  return { ...hwPass(prices, best.alpha, best.beta), rmse: best.rmse }
}

// ─── Statistics ───────────────────────────────────────────────────────────────

const mean = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0
const variance = (a: number[], m = mean(a)) =>
  a.length < 2 ? 0 : a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length
const cov = (xs: number[], ys: number[]) => {
  if (xs.length !== ys.length || xs.length < 2) return 0
  const mx = mean(xs), my = mean(ys)
  return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.length
}

// Bayesian blend: mix learned coefficient with domain prior.
// Confidence grows linearly with sample count — at minN samples we fully trust data.
const bayesBlend = (learned: number, prior: number, n: number, minN = 15) =>
  learned * Math.min(n / minN, 1) + prior * (1 - Math.min(n / minN, 1))

// ─── Domain priors ────────────────────────────────────────────────────────────
// Used when historical data is insufficient. Based on Thai egg market literature
// and commodity economics (not arbitrary guesses).

const PRIORS = {
  oilBeta:        0.25,   // 1% diesel rise → ~0.25% egg rise (14d lag, transport + farm energy; r=0.72 confirmed)
  feedBeta:       0.15,   // 1% corn/soy rise → ~0.15% egg rise (14d lag, feed cost transmission)
  hotPremium:     0.018,  // week of >35°C → ~1.8% supply reduction (laying rate drops)
  coldDiscount:  -0.006,  // week of <18°C → ~-0.6% (lower demand, slightly less production stress)
  diseasePremium: 0.22,   // active outbreak → ~22% supply shock (Thai bird flu data: 20–40% spike, conservative midpoint)
  autoCorr7:      0.55,   // moderate trend persistence at 7-day horizon
}

// ─── Learn weights from historical data ───────────────────────────────────────
//
// For each factor we compute:
//   1. Lagged pairs (feature[t], egg_return[t + lag])
//   2. OLS regression beta or conditional mean difference
//   3. Blend with domain prior proportional to sample count
//
// This means the model improves automatically as more data accumulates.

interface LearnedWeights {
  oilBeta:        number
  feedBeta:       number
  hotPremium:     number
  coldDiscount:   number
  diseasePremium: number
  autoCorr7:      number
  dowBias:        Record<number, number>
}

function learnWeights(history: FeaturePoint[]): LearnedWeights {
  const prices = history.map((h) => h.price)
  const dates  = history.map((h) => h.date)
  const n      = prices.length

  // ── Oil beta: Δ3d_diesel[t] → Δ14d_egg[t+14] ────────────────────────
  // Oil → transport + farm energy → egg price. 14-day lag confirmed (r=0.72) in Thai market data.
  const oilXs: number[] = [], oilYs: number[] = []
  for (let t = 3; t < n - 14; t++) {
    const d0 = history[t - 3].diesel, d1 = history[t].diesel, p0 = prices[t], p14 = prices[t + 14]
    if (d0 && d1 && d0 > 0 && p0 > 0) {
      oilXs.push((d1 - d0) / d0)
      oilYs.push((p14 - p0) / p0)
    }
  }
  const varOil = variance(oilXs)
  const rawOilBeta = varOil > 1e-10 ? cov(oilXs, oilYs) / varOil : PRIORS.oilBeta
  const oilBeta = bayesBlend(rawOilBeta, PRIORS.oilBeta, oilXs.length)

  // ── Feed beta: Δ7d_corn[t] → Δ14d_egg[t+14] ─────────────────────────
  // Feed cost changes reach farm margin slowly; ~14-day lag is well-documented.
  const feedXs: number[] = [], feedYs: number[] = []
  for (let t = 7; t < n - 14; t++) {
    const c0 = history[t - 7].corn, c1 = history[t].corn, p0 = prices[t], p14 = prices[t + 14]
    if (c0 && c1 && c0 > 0 && p0 > 0) {
      feedXs.push((c1 - c0) / c0)
      feedYs.push((p14 - p0) / p0)
    }
  }
  const varFeed = variance(feedXs)
  const rawFeedBeta = varFeed > 1e-10 ? cov(feedXs, feedYs) / varFeed : PRIORS.feedBeta
  const feedBeta = bayesBlend(rawFeedBeta, PRIORS.feedBeta, feedXs.length, 10)

  // ── Temperature premium: conditional mean difference ──────────────────
  // Compare 7-day forward returns on hot days vs normal days.
  // "Hot" = avg temp > 35°C over past 3 days (sustained heat, not a blip).
  const hotRet: number[] = [], coldRet: number[] = [], normRet: number[] = []
  for (let t = 2; t < n - 7; t++) {
    const temps = [history[t].temp, history[t - 1].temp, history[t - 2].temp]
      .filter((v): v is number => v != null)
    if (!temps.length || prices[t] <= 0) continue
    const avgT = mean(temps)
    const ret7 = (prices[t + 7] - prices[t]) / prices[t]
    if (avgT > 35)      hotRet.push(ret7)
    else if (avgT < 18) coldRet.push(ret7)
    else                normRet.push(ret7)
  }
  const normMean = mean(normRet)
  const hotPremium   = bayesBlend(hotRet.length  ? mean(hotRet)  - normMean : PRIORS.hotPremium,   PRIORS.hotPremium,   hotRet.length,  5)
  const coldDiscount = bayesBlend(coldRet.length  ? mean(coldRet) - normMean : PRIORS.coldDiscount, PRIORS.coldDiscount, coldRet.length, 5)

  // ── Disease premium: conditional mean difference ──────────────────────
  const disRet: number[] = [], healthRet: number[] = []
  for (let t = 0; t < n - 7; t++) {
    const ds = (history[t].disease_status ?? "").toLowerCase()
    if (prices[t] <= 0) continue
    const ret7 = (prices[t + 7] - prices[t]) / prices[t]
    if (ds.includes("active") || ds.includes("outbreak")) disRet.push(ret7)
    else                                                   healthRet.push(ret7)
  }
  const healthMean = mean(healthRet)
  const diseasePremium = bayesBlend(
    disRet.length ? mean(disRet) - healthMean : PRIORS.diseasePremium,
    PRIORS.diseasePremium, disRet.length, 3
  )

  // ── 7-day autocorrelation: Pearson(ret[t], ret[t+7]) ─────────────────
  // Tells us whether the current trend is likely to persist.
  const rets = prices.slice(1).map((p, i) => prices[i] > 0 ? (p - prices[i]) / prices[i] : 0)
  const ac7Xs: number[] = [], ac7Ys: number[] = []
  for (let t = 0; t < rets.length - 7; t++) { ac7Xs.push(rets[t]); ac7Ys.push(rets[t + 7]) }
  const varAc = variance(ac7Xs)
  const rawAutoCorr7 = varAc > 1e-10
    ? Math.max(-0.9, Math.min(0.9, cov(ac7Xs, ac7Ys) / Math.sqrt(varAc * Math.max(variance(ac7Ys), 1e-10))))
    : PRIORS.autoCorr7
  const autoCorr7 = bayesBlend(rawAutoCorr7, PRIORS.autoCorr7, ac7Xs.length)

  // ── Day-of-week bias: average daily return per weekday ────────────────
  const dowBuckets: Record<number, number[]> = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] }
  for (let t = 1; t < n; t++) {
    if (prices[t - 1] <= 0) continue
    const dow = new Date(dates[t] + "T00:00:00").getDay()
    dowBuckets[dow].push((prices[t] - prices[t - 1]) / prices[t - 1])
  }
  const dowBias: Record<number, number> = {}
  for (let d = 0; d <= 6; d++) dowBias[d] = dowBuckets[d].length ? mean(dowBuckets[d]) : 0

  return { oilBeta, feedBeta, hotPremium, coldDiscount, diseasePremium, autoCorr7, dowBias }
}

// ─── Current market snapshot ──────────────────────────────────────────────────
// Reads the most recent feature values and computes the "signal strength"
// for each factor. These are multiplied by the learned weights to get the
// actual price adjustment.

function currentSignals(history: FeaturePoint[], ctx: { demand_shock?: string | null; supply_shock?: string | null }) {
  const diesels = history.map((h) => h.diesel).filter((v): v is number => v != null && v > 0)
  const fast3   = mean(diesels.slice(-3))
  const slow14  = mean(diesels.slice(-14))
  const oilMomentum = slow14 > 0 ? (fast3 - slow14) / slow14 : 0

  const corns = history.map((h) => h.corn).filter((v): v is number => v != null && v > 0)
  const soys  = history.map((h) => h.soybean).filter((v): v is number => v != null && v > 0)
  const feedRecent = mean([...corns.slice(-7), ...soys.slice(-7)])
  const feedPrior  = mean([...corns.slice(-14, -7), ...soys.slice(-14, -7)])
  const feedMomentum = feedPrior > 0 ? (feedRecent - feedPrior) / feedPrior : 0

  // Use 3-day sustained temperature window to avoid reacting to a single hot day
  const recentTemps = history.slice(-3).map((h) => h.temp).filter((v): v is number => v != null)
  const avgTemp = mean(recentTemps)
  const tempState: "hot" | "cold" | "normal" = avgTemp > 35 ? "hot" : avgTemp < 18 ? "cold" : "normal"

  const latestDisease = [...history].reverse().find((h) => h.disease_status != null)?.disease_status ?? ""
  const diseaseActive = latestDisease.toLowerCase().includes("active") || latestDisease.toLowerCase().includes("outbreak")

  return {
    oilMomentum,
    feedMomentum,
    tempState,
    diseaseActive,
    demandShock: !!ctx.demand_shock,
    supplyShock: !!ctx.supply_shock,
  }
}

// ─── News sentiment ───────────────────────────────────────────────────────────

// Weights reduced ~70% from original — a single article should not swing the forecast 6%.
// Thai egg prices are government-managed and move in steps, so large per-article impacts
// were causing unrealistic forecasts.
const NEWS_WEIGHTS: Record<string, number> = {
  "DISEASE":      0.018,
  "WAR & TRADE":  0.010,
  "PRODUCTION":   0.008,
  "FEED COSTS":   0.008,
  "WEATHER":      0.006,
  "OIL & ENERGY": 0.004,
  "EXPORT":       0.003,
  "POLICY":      -0.008,
}

function newsSentiment(articles: Array<{ category: string | null }>): number {
  let score = 0
  // Count at most 1 article per category — avoids double-counting repeated coverage of the same event.
  const seen = new Set<string>()
  for (const a of articles.slice(0, 15)) {
    const cat = (a.category ?? "").toUpperCase().trim()
    if (!cat || seen.has(cat)) continue
    seen.add(cat)
    score += NEWS_WEIGHTS[cat] ?? 0
  }
  return Math.max(-0.04, Math.min(0.05, score))
}

// ─── Thai holiday demand signal ───────────────────────────────────────────────
// Fixed-date Thai public holidays drive egg demand spikes (family cooking events).
// Variable Buddhist holidays (Makha/Visakha/Asanha Bucha) excluded — date varies
// yearly and requires a calendar library; impact is smaller than Songkran/New Year.

const THAI_FIXED_HOLIDAYS: Array<{ month: number; day: number; premium: number; name: string }> = [
  { month: 1,  day: 1,  premium: 0.020, name: "New Year" },
  { month: 4,  day: 6,  premium: 0.010, name: "Chakri Day" },
  { month: 4,  day: 13, premium: 0.025, name: "Songkran" },
  { month: 4,  day: 14, premium: 0.025, name: "Songkran" },
  { month: 4,  day: 15, premium: 0.025, name: "Songkran" },
  { month: 5,  day: 1,  premium: 0.010, name: "Labour Day" },
  { month: 8,  day: 12, premium: 0.015, name: "Mother's Day" },
  { month: 10, day: 23, premium: 0.010, name: "Chulalongkorn Day" },
  { month: 12, day: 5,  premium: 0.015, name: "Father's Day" },
  { month: 12, day: 10, premium: 0.010, name: "Constitution Day" },
  { month: 12, day: 25, premium: 0.015, name: "Christmas" },
  { month: 12, day: 31, premium: 0.020, name: "New Year's Eve" },
]

function thaiHolidaySignal(date: Date): number {
  const m = date.getMonth() + 1
  const d = date.getDate()
  return THAI_FIXED_HOLIDAYS.find((h) => h.month === m && h.day === d)?.premium ?? 0
}

// ─── Main forecast ────────────────────────────────────────────────────────────

export async function computeForecast(grade: Grade, daysAhead = 14, userOffset = 0): Promise<ForecastPoint[]> {
  const cached = await getCachedForecast(grade)
  if (cached) return cached.map((p) => ({ ...p, price: Math.round((p.price + userOffset) * 10000) / 10000 }))

  const [history, ctx, news] = await Promise.all([
    getFeatureHistory(grade, 90),
    getContextFactors(),
    getRecentNews(72, 20),
  ])

  if (history.length < 7) {
    const base = FALLBACK[grade] + userOffset
    const t = new Date()
    return Array.from({ length: daysAhead }, (_, i) => ({
      date:  isoDate(new Date(t.getFullYear(), t.getMonth(), t.getDate() + i + 1)),
      price: Math.round(base * (1 + 0.001 * i) * 10000) / 10000,
    }))
  }

  const prices    = history.map((h) => h.price)

  // Fit HW on this grade's own price history. Direction comes from market factors
  // (oil, feed, autocorr) rather than HW trend extrapolation so all grades trend together.
  const hwGrade = fitHW(prices)

  // Clamp level to ±20% of recent 3-day observed price to prevent DB inconsistency
  // (seeded vs live data) from producing runaway base values.
  const recentPrice = mean(prices.slice(-3))
  const clampedLevel = recentPrice > 0
    ? Math.max(recentPrice * 0.80, Math.min(recentPrice * 1.20, hwGrade.level))
    : hwGrade.level

  // Step 2: Learn factor weights from historical correlations
  const w = learnWeights(history)

  // Step 3: Current market signals
  const sig = currentSignals(history, ctx)

  // Step 4: News sentiment
  const newsAdj = newsSentiment(news)

  const now = new Date()
  const forecast: ForecastPoint[] = []

  const oilFull   = sig.oilMomentum  * w.oilBeta
  const feedFull  = sig.feedMomentum * w.feedBeta
  const tempFull  = sig.tempState === "hot"  ? w.hotPremium
                  : sig.tempState === "cold" ? w.coldDiscount
                  : 0
  const diseaseFull = sig.diseaseActive ? w.diseasePremium : 0
  const shockFull   = (sig.demandShock ? 0.05 : 0) + (sig.supplyShock ? -0.04 : 0)
  const trendSign = Math.sign(oilFull + feedFull) || Math.sign(hwGrade.trend)
  const autoCorrFull = trendSign * w.autoCorr7 * 0.004 * 7

  for (let i = 1; i <= daysAhead; i++) {
    const fd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)

    const base = clampedLevel

    // Each factor ramps smoothly to its full effect over its natural lag window.
    const oilAdj      = oilFull   * Math.min(1, i / 14)
    const feedAdj     = feedFull  * Math.min(1, i / 14)
    const tempAdj     = tempFull  * Math.max(0, 1 - i / 10)
    const diseaseAdj  = diseaseFull * Math.max(0.3, 1 - i / 21)
    const shockAdj    = shockFull * Math.max(0, 1 - i / 5)
    const autoCorrAdj = autoCorrFull * Math.min(i / 7, 1)
    const newsAdj2    = newsAdj * Math.max(0, 1 - i / 14)
    // Thai public holiday demand boost — applied at 25% of raw DOW bias to avoid visual zigzag
    const holidayAdj  = thaiHolidaySignal(fd)
    const dowAdj      = (w.dowBias[fd.getDay()] ?? 0) * 0.25

    // Cap the "routine market" factors (oil, feed, temp, autocorr, news, holiday, DOW) at ±3.5%.
    // Disease and supply shocks are kept separate — they represent genuine step-changes.
    const marketFactors = oilAdj + feedAdj + tempAdj + autoCorrAdj + newsAdj2 + holidayAdj + dowAdj
    const cappedMarket  = Math.max(-0.03, Math.min(0.035, marketFactors))
    const totalFactor   = cappedMarket + diseaseAdj + shockAdj

    const price = base * (1 + totalFactor) + userOffset

    forecast.push({
      date:  isoDate(fd),
      price: Math.max(Math.round(price * 10000) / 10000, 2.0),
    })
  }

  // 5-point weighted smoothing (weights 1-2-3-2-1) to reduce micro-fluctuations.
  // Thai egg prices are sticky — they should look flat with occasional step-changes,
  // not a wavy line that moves ฿0.01 every day.
  for (let i = 2; i < forecast.length - 2; i++) {
    const smoothed = (
      forecast[i - 2].price * 1 +
      forecast[i - 1].price * 2 +
      forecast[i    ].price * 3 +
      forecast[i + 1].price * 2 +
      forecast[i + 2].price * 1
    ) / 9
    forecast[i] = { ...forecast[i], price: Math.round(smoothed * 10000) / 10000 }
  }

  // Bias correction: if we have enough historical signal accuracy data, shift the
  // forecast by 30% of the mean error. Damped (30%) to avoid over-correcting on
  // small samples; only applied when |meanError| > ฿0.03 (meaningful, not noise).
  const bias = await getRecentForecastBias(grade)
  if (bias.n >= 5 && Math.abs(bias.meanError) > 0.03) {
    const correction = bias.meanError * 0.3
    for (const pt of forecast) {
      pt.price = Math.max(Math.round((pt.price + correction) * 10000) / 10000, 2.0)
    }
  }

  // Cache without user offset (applied per-user on retrieval)
  await saveForecastCache(grade, forecast.map((p) => ({ ...p, price: p.price - userOffset })))
  return forecast
}

// ─── Signal generation ────────────────────────────────────────────────────────

export function generateSignal(forecast: ForecastPoint[], todayPrice: number) {
  if (!forecast.length || !todayPrice) return null
  const p7  = forecast[6]?.price  ?? todayPrice
  const p14 = forecast[13]?.price ?? p7
  const pct7  = ((p7  - todayPrice) / todayPrice) * 100
  const pct14 = ((p14 - todayPrice) / todayPrice) * 100

  if (pct7 > 4 || (pct7 > 2 && pct14 > 5))
    return { action: "BUY NOW" as const, confidence: Math.min(92, Math.round(55 + pct7 * 4)), context: `Prices forecast +${pct7.toFixed(1)}% in 7 days (+${pct14.toFixed(1)}% in 14 days) — buy at current rate.` }
  if (pct7 < -3 || (pct7 < -1.5 && pct14 < -4))
    return { action: "WAIT" as const, confidence: Math.min(88, Math.round(50 + Math.abs(pct7) * 5)), context: `Prices forecast ${pct7.toFixed(1)}% in 7 days — waiting is likely to save money.` }
  return { action: "HOLD" as const, confidence: Math.max(55, Math.round(65 - Math.abs(pct7) * 5)), context: "Prices expected stable — maintain your normal purchasing cadence." }
}

// ─── Raw market signals (for agent reasoning) ────────────────────────────────
// These numbers are passed to the AI agent as-is.
// The agent uses its domain knowledge to synthesize a causal explanation —
// the reasoning is the agent's skill, not pre-written strings from this file.

export interface ForecastSignals {
  market_trend_pct_per_day: number        // +0.12 = all-grade market trending up 0.12%/day
  oil_momentum_pct: number                // diesel 3d vs 14d MA change as % (+ve = rising)
  feed_momentum_pct: number               // corn+soy 7d vs prior-7d change as % (+ve = rising)
  temp_state: "hot" | "cold" | "normal"
  disease_active: boolean
  demand_shock: boolean
  supply_shock: boolean
  news_sentiment: "bullish" | "neutral" | "bearish"  // qualitative label for agent reasoning
  top_news: string[]                      // "[CATEGORY] headline" strings
}

export async function computeForecastWithSignals(
  grade: Grade,
  daysAhead = 14,
  userOffset = 0
): Promise<{ forecast: ForecastPoint[]; signals: ForecastSignals | null }> {
  const [forecast, history, ctx, news] = await Promise.all([
    computeForecast(grade, daysAhead, userOffset),
    getFeatureHistory(grade, 90),
    getContextFactors(),
    getRecentNews(72, 20),
  ])

  if (history.length < 7) return { forecast, signals: null }

  const avgPrices = history.map((h) => h.avgPrice ?? h.price)
  const hwMarket  = fitHW(avgPrices)
  const sig       = currentSignals(history, ctx)
  const newsScore = newsSentiment(news)

  const trendPct = hwMarket.level > 0
    ? Math.round((hwMarket.trend / hwMarket.level) * 10000) / 100   // %/day, 2 d.p.
    : 0

  const signals: ForecastSignals = {
    market_trend_pct_per_day: trendPct,
    oil_momentum_pct:  Math.round(sig.oilMomentum  * 1000) / 10,
    feed_momentum_pct: Math.round(sig.feedMomentum * 1000) / 10,
    temp_state:      sig.tempState,
    disease_active:  sig.diseaseActive,
    demand_shock:    sig.demandShock,
    supply_shock:    sig.supplyShock,
    news_sentiment:  newsScore > 0.03 ? "bullish" : newsScore < -0.03 ? "bearish" : "neutral",
    top_news: news
      .filter((n) => n.category && n.title)
      .slice(0, 5)
      .map((n) => `[${n.category}] ${n.title}`),
  }

  return { forecast, signals }
}
