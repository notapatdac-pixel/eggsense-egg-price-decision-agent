"use client"
import { useState, useEffect } from "react"
import { Store, BadgeCheck, Package, MapPin, Calendar, TrendingUp, CircleDollarSign, MessageSquare } from "lucide-react"
import { ForecastChart } from "@/components/charts/ForecastChart"
import type { AiProfile, PricePoint, ForecastPoint, OilPoint } from "@/lib/types"

type TopicStat = { topic: string; count: number }
type TopQuestion = { text: string; topic: string; count: number }

const TOPIC_COLORS: Record<string, string> = {
  FORECAST:       "bg-blue-500",
  PRICE_CHECK:    "bg-orange-500",
  BUYING_ADVICE:  "bg-green-500",
  MARKET_FACTOR:  "bg-purple-500",
  MARKET_NEWS:    "bg-red-500",
  COST_ANALYSIS:  "bg-teal-500",
  BUSINESS_ADVICE:"bg-amber-500",
}
const TOPIC_LABELS: Record<string, string> = {
  FORECAST:       "Forecast",
  PRICE_CHECK:    "Price Check",
  BUYING_ADVICE:  "Buying Advice",
  MARKET_FACTOR:  "Market Factors",
  MARKET_NEWS:    "Market News",
  COST_ANALYSIS:  "Cost Analysis",
  BUSINESS_ADVICE:"Business Advice",
}

const PROVINCE_REGIONS: Array<[string, string[]]> = [
  ["North",      ["เชียงใหม่", "chiang mai", "เชียงราย", "chiang rai", "ลำปาง", "lampang", "แม่ฮ่องสอน", "น่าน", "nan", "ลำพูน", "lamphun", "พะเยา", "phayao", "แพร่", "phrae"]],
  ["Northeast",  ["ขอนแก่น", "khon kaen", "นครราชสีมา", "korat", "อุบลราชธานี", "ubon", "อุดรธานี", "udon", "สกลนคร", "sakon nakhon", "ร้อยเอ็ด", "roi et", "มหาสารคาม", "มุกดาหาร", "เลย", "loei", "หนองคาย", "nong khai", "ชัยภูมิ", "chaiyaphum", "ยโสธร", "ศรีสะเกษ", "นครพนม"]],
  ["Central",    ["กรุงเทพ", "bangkok", "นครปฐม", "nakhon pathom", "สุพรรณบุรี", "suphan buri", "อยุธยา", "ayutthaya", "ลพบุรี", "lopburi", "สระบุรี", "saraburi", "นนทบุรี", "nonthaburi", "ปทุมธานี", "pathum thani", "สมุทรปราการ", "samut prakan", "สมุทรสาคร", "samut sakhon", "สมุทรสงคราม", "สิงห์บุรี", "อ่างทอง", "นครนายก", "ปราจีนบุรี"]],
  ["East",       ["ชลบุรี", "chonburi", "ระยอง", "rayong", "จันทบุรี", "chanthaburi", "ตราด", "trat", "ฉะเชิงเทรา", "chachoengsao", "สระแก้ว", "sa kaeo"]],
  ["South",      ["สงขลา", "songkhla", "ภูเก็ต", "phuket", "สุราษฎร์", "surat", "นครศรีธรรมราช", "nakhon si", "กระบี่", "krabi", "พังงา", "phang nga", "ตรัง", "trang", "สตูล", "satun", "พัทลุง", "phatthalung", "ปัตตานี", "pattani", "ยะลา", "yala", "นราธิวาส", "narathiwat", "ชุมพร", "chumphon", "ระนอง", "ranong"]],
  ["West",       ["กาญจนบุรี", "kanchanaburi", "ตาก", "tak", "ราชบุรี", "ratchaburi", "เพชรบุรี", "phetchaburi", "ประจวบ", "prachuap"]],
  ["North Central", ["นครสวรรค์", "nakhon sawan", "อุทัยธานี", "uthai thani", "ชัยนาท", "chai nat", "กำแพงเพชร", "kamphaeng phet", "พิษณุโลก", "phitsanulok", "สุโขทัย", "sukhothai", "อุตรดิตถ์", "uttaradit", "เพชรบูรณ์", "phetchabun", "พิจิตร", "phichit"]],
]

function provinceToRegion(province: string): string | null {
  const p = province.toLowerCase()
  for (const [region, terms] of PROVINCE_REGIONS) {
    if (terms.some((t) => p.includes(t))) return region
  }
  return null
}

const GRADES = [0, 1, 2, 3, 4, 5]

export default function ProfilePage({ profile }: { profile: AiProfile | null }) {
  const preferredGradeNum =
    profile?.preferred_grade != null
      ? parseInt(String(profile.preferred_grade).replace(/\D/g, "")) || 0
      : 0
  const [activeGrade, setActiveGrade] = useState(preferredGradeNum)
  const [historical, setHistorical] = useState<PricePoint[]>([])
  const [forecast, setForecast] = useState<ForecastPoint[]>([])
  const [oil, setOil] = useState<OilPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [topQuestions, setTopQuestions] = useState<TopQuestion[]>([])
  const [topicStats, setTopicStats] = useState<TopicStat[]>([])
  const today = new Date().toISOString().split("T")[0]

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/prices?grade=${activeGrade}&days=60`).then((r) => r.json()),
      fetch(`/api/forecast?grade=${activeGrade}`).then((r) => r.json()),
    ])
      .then(([prices, fc]) => {
        setHistorical(prices.history ?? [])
        setOil(prices.oil ?? [])
        setForecast(fc.forecast ?? [])
      })
      .finally(() => setLoading(false))
  }, [activeGrade])

  useEffect(() => {
    fetch("/api/questions")
      .then((r) => r.json())
      .then((d: { questions: TopQuestion[]; stats: TopicStat[] }) => {
        setTopQuestions(d.questions ?? [])
        setTopicStats(d.stats ?? [])
      })
      .catch(() => {})
  }, [])

  // Per-grade personalisation derived from profile
  const profileRaw = profile as unknown as Record<string, unknown>
  const gradeOffset = parseFloat(String(profileRaw?.[`price_offset_g${activeGrade}`] ?? 0)) || 0
  const hasPersonalPrice = profileRaw?.[`personal_price_g${activeGrade}`] != null
  const personalPrice = hasPersonalPrice
    ? parseFloat(String(profileRaw[`personal_price_g${activeGrade}`]))
    : null

  // Apply user offset to historical so chart lines up with forecast
  const historicalAdjusted: PricePoint[] = hasPersonalPrice
    ? historical.map((p) => ({ ...p, price: Math.round((p.price + gradeOffset) * 100) / 100 }))
    : historical

  const todayPrice  = historicalAdjusted[historicalAdjusted.length - 1]?.price ?? null
  const price7d     = forecast[6]?.price  ?? null
  const price14d    = forecast[13]?.price ?? null
  const pct7  = todayPrice && price7d  ? ((price7d  - todayPrice) / todayPrice) * 100 : null
  const pct14 = todayPrice && price14d ? ((price14d - todayPrice) / todayPrice) * 100 : null

  const score = profile?.profile_score ?? 0
  const collectedFields = [
    profile?.collected_business,
    profile?.collected_grade,
    profile?.collected_usage,
    profile?.collected_price,
    profile?.collected_supplier,
  ].filter(Boolean).length

  const topKpis = [
    { icon: Store,      iconBg: "bg-blue-50",   iconColor: "text-blue-500",  label: "BUSINESS TYPE",   value: profile?.business_type    ?? "—" },
    { icon: BadgeCheck, iconBg: "bg-orange-50", iconColor: "text-primary",   label: "PREFERRED GRADE", value: profile?.preferred_grade ? `Grade ${String(profile.preferred_grade).replace(/\D/g, "")}` : "—" },
    { icon: Package,    iconBg: "bg-teal-50",   iconColor: "text-teal-600",  label: "DAILY USAGE",     value: profile?.daily_egg_usage  ? `${profile.daily_egg_usage} eggs/day` : "—" },
  ]

  const bottomKpis = [
    { icon: MapPin,           iconBg: "bg-purple-50", iconColor: "text-purple-500", label: "SUPPLIER REGION",   value: (() => { const raw = profile?.supplier_region ?? null; if (!raw) return "—"; const r = provinceToRegion(raw); return r ? `${r} (${raw})` : raw })() },
    { icon: Calendar,         iconBg: "bg-green-50",  iconColor: "text-green-600",  label: "RESTOCK DAY",       value: profile?.typical_restock_day  ?? "—" },
    { icon: TrendingUp,       iconBg: "bg-rose-50",   iconColor: "text-rose-500",   label: "PRICE SENSITIVITY", value: profile?.price_sensitivity     ?? "—" },
    { icon: CircleDollarSign, iconBg: "bg-amber-50",  iconColor: "text-amber-600",  label: "AVG MONTHLY SPEND", value: profile?.avg_monthly_spend ? `฿${Number(profile.avg_monthly_spend).toLocaleString()}` : "—" },
  ]

  return (
    <div className="space-y-5">
      {/* Profile completion bar */}
      <div className="card p-4">
        <div className="flex justify-between items-center mb-2">
          <p className="text-[13px] font-semibold text-[#3D3830]">Profile Completion</p>
          <span className="text-[13px] font-bold text-primary">{score}/100</span>
        </div>
        <div className="h-2 bg-[#EDE8DF] rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>
        {score < 100 && (
          <p className="text-[11px] text-[#9E9890] mt-1.5">
            {5 - collectedFields} field{5 - collectedFields !== 1 ? "s" : ""} remaining — chat with the AI Agent to complete your profile
          </p>
        )}
      </div>

      {/* Top KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {topKpis.map(({ icon: Icon, iconBg, iconColor, label, value }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
                <Icon size={20} className={iconColor} strokeWidth={1.8} />
              </div>
              <p className="text-[11px] font-bold text-[#9E9890] uppercase tracking-[0.07em]">{label}</p>
            </div>
            <p className="text-[22px] font-bold text-[#1A1A1A] leading-tight">{value}</p>
          </div>
        ))}
      </div>

      {/* Bottom KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        {bottomKpis.map(({ icon: Icon, iconBg, iconColor, label, value }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
                <Icon size={16} className={iconColor} strokeWidth={1.8} />
              </div>
              <p className="text-[10px] font-bold text-[#9E9890] uppercase tracking-[0.06em]">{label}</p>
            </div>
            <p className="text-[16px] font-bold text-[#1A1A1A] leading-tight">{value}</p>
          </div>
        ))}
      </div>

      {/* Forecast chart */}
      <div className="card p-5">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-[#1A1A1A]">Individual Forecast</h3>
            {hasPersonalPrice && gradeOffset !== 0 && (
              <p className="text-[11px] text-[#9E9890] mt-0.5">
                Your price offset: {gradeOffset > 0 ? "+" : ""}฿{gradeOffset.toFixed(2)} vs DIT median
              </p>
            )}
          </div>
          <div className="flex gap-1">
            {GRADES.map((g) => {
              const gradeHasPrice = profileRaw?.[`personal_price_g${g}`] != null
              return (
                <button
                  key={g}
                  onClick={() => setActiveGrade(g)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors relative ${
                    activeGrade === g
                      ? "bg-primary text-white"
                      : "bg-[#F5F0EB] text-[#7A736A] hover:bg-[#EDE8DF]"
                  }`}
                >
                  G{g}
                  {gradeHasPrice && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="h-[320px] flex items-center justify-center text-[#9E9890] text-sm">
            Loading forecast…
          </div>
        ) : !hasPersonalPrice ? (
          <div className="h-[320px] flex flex-col items-center justify-center gap-3">
            <p className="text-[18px] font-bold text-[#1A1A1A]">No data</p>
            <p className="text-[13px] text-[#9E9890] text-center max-w-[260px] leading-relaxed">
              Tell the AI Agent your purchase price for Grade {activeGrade} to see your personalised chart.
            </p>
          </div>
        ) : (
          <ForecastChart
            historical={historicalAdjusted}
            forecast={forecast}
            oil={oil}
            today={today}
            showOil={false}
            personalized={true}
            grade={activeGrade}
          />
        )}
      </div>

      {/* Community Insights */}
      {(topQuestions.length > 0 || topicStats.length > 0) && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <MessageSquare size={16} className="text-blue-500" strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-[#1A1A1A]">Community Insights</h3>
              <p className="text-[11px] text-[#9E9890]">What users ask most — last 30 days</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* Topic breakdown */}
            {topicStats.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[#7A736A] uppercase tracking-[0.06em] mb-3">By Topic</p>
                <div className="space-y-2">
                  {(() => {
                    const total = topicStats.reduce((s, t) => s + t.count, 0)
                    return topicStats.slice(0, 6).map(({ topic, count }) => (
                      <div key={topic}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[12px] text-[#3D3830]">{TOPIC_LABELS[topic] ?? topic}</span>
                          <span className="text-[11px] text-[#9E9890]">{count}</span>
                        </div>
                        <div className="h-1.5 bg-[#F0EBE3] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${TOPIC_COLORS[topic] ?? "bg-gray-400"}`}
                            style={{ width: `${Math.round((count / total) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </div>
            )}

            {/* Top questions */}
            {topQuestions.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-[#7A736A] uppercase tracking-[0.06em] mb-3">Top Questions</p>
                <div className="space-y-2">
                  {topQuestions.slice(0, 5).map((q, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold ${TOPIC_COLORS[q.topic] ?? "bg-gray-400"}`}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[#3D3830] leading-tight line-clamp-2">{q.text}</p>
                        <p className="text-[10px] text-[#B0AAA2] mt-0.5">asked {q.count}×</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Price KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-[11px] font-semibold text-[#9E9890] uppercase tracking-[0.06em] mb-2">
            {hasPersonalPrice ? "Your Price Today" : "Today's DIT Price"}
          </p>
          <div className="flex items-baseline gap-1">
            <p className="text-[28px] font-bold text-[#1A1A1A] tracking-tight">
              {todayPrice != null ? `฿${todayPrice.toFixed(2)}` : "—"}
            </p>
            {todayPrice != null && <span className="text-[14px] text-[#9E9890]">/unit</span>}
          </div>
          {hasPersonalPrice && personalPrice != null && (
            <p className="text-[11px] text-[#9E9890] mt-1">
              Your actual price: ฿{personalPrice.toFixed(2)}
            </p>
          )}
        </div>
        <div className="card p-5">
          <p className="text-[11px] font-semibold text-[#9E9890] uppercase tracking-[0.06em] mb-2">7D Forecast</p>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <p className="text-[28px] font-bold text-[#1A1A1A] tracking-tight">
              {price7d != null ? `฿${price7d.toFixed(2)}` : "—"}
            </p>
            {price7d != null && <span className="text-[14px] text-[#9E9890]">/unit</span>}
            {pct7 != null && (
              <span className={`text-[14px] font-semibold ${pct7 >= 0 ? "text-success" : "text-danger"}`}>
                {pct7 >= 0 ? "+" : ""}{pct7.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div className="card p-5">
          <p className="text-[11px] font-semibold text-[#9E9890] uppercase tracking-[0.06em] mb-2">14D Forecast</p>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <p className="text-[28px] font-bold text-[#1A1A1A] tracking-tight">
              {price14d != null ? `฿${price14d.toFixed(2)}` : "—"}
            </p>
            {price14d != null && <span className="text-[14px] text-[#9E9890]">/unit</span>}
            {pct14 != null && (
              <span className={`text-[14px] font-semibold ${pct14 >= 0 ? "text-success" : "text-danger"}`}>
                {pct14 >= 0 ? "+" : ""}{pct14.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
