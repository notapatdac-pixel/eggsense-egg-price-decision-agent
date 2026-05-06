"use client"
import { useState, useEffect } from "react"
import { Store, BadgeCheck, Package, MapPin, Calendar, TrendingUp, CircleDollarSign } from "lucide-react"
import { ForecastChart } from "@/components/charts/ForecastChart"
import type { AiProfile, PricePoint, ForecastPoint, OilPoint } from "@/lib/types"

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

  const todayPrice = historical[historical.length - 1]?.price ?? null
  const price7d    = forecast[6]?.price  ?? null
  const price14d   = forecast[13]?.price ?? null
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
    { icon: Store,     iconBg: "bg-blue-50",   iconColor: "text-blue-500",  label: "BUSINESS TYPE",   value: profile?.business_type    ?? "—" },
    { icon: BadgeCheck,iconBg: "bg-orange-50", iconColor: "text-primary",   label: "PREFERRED GRADE", value: profile?.preferred_grade ? `Grade ${String(profile.preferred_grade).replace(/\D/g, "")}` : "—" },
    { icon: Package,   iconBg: "bg-teal-50",   iconColor: "text-teal-600",  label: "DAILY USAGE",     value: profile?.daily_egg_usage  ? `${profile.daily_egg_usage} eggs/day` : "—" },
  ]

  const bottomKpis = [
    { icon: MapPin,           iconBg: "bg-purple-50", iconColor: "text-purple-500", label: "SUPPLIER REGION",  value: profile?.supplier_region     ?? "—" },
    { icon: Calendar,         iconBg: "bg-green-50",  iconColor: "text-green-600",  label: "RESTOCK DAY",      value: profile?.typical_restock_day  ?? "—" },
    { icon: TrendingUp,       iconBg: "bg-rose-50",   iconColor: "text-rose-500",   label: "PRICE SENSITIVITY",value: profile?.price_sensitivity     ?? "—" },
    { icon: CircleDollarSign, iconBg: "bg-amber-50",  iconColor: "text-amber-600",  label: "AVG MONTHLY SPEND",value: profile?.avg_monthly_spend ? `฿${Number(profile.avg_monthly_spend).toLocaleString()}` : "—" },
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

      {/* Top KPI row */}
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

      {/* Bottom KPI row — additional profile fields */}
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
          <h3 className="text-[16px] font-bold text-[#1A1A1A]">Individual Forecast</h3>
          <div className="flex gap-1">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGrade(g)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  activeGrade === g
                    ? "bg-primary text-white"
                    : "bg-[#F5F0EB] text-[#7A736A] hover:bg-[#EDE8DF]"
                }`}
              >
                Grade {g}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="h-[320px] flex items-center justify-center text-[#9E9890] text-sm">
            Loading forecast…
          </div>
        ) : (
          <ForecastChart
            historical={historical}
            forecast={forecast}
            oil={oil}
            today={today}
            showOil={false}
            personalized={score >= 80}
            grade={activeGrade}
          />
        )}
      </div>

      {/* Price KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-[11px] font-semibold text-[#9E9890] uppercase tracking-[0.06em] mb-2">Today&apos;s DIT Price</p>
          <div className="flex items-baseline gap-1">
            <p className="text-[28px] font-bold text-[#1A1A1A] tracking-tight">
              {todayPrice != null ? `฿${todayPrice.toFixed(2)}` : "—"}
            </p>
            {todayPrice != null && <span className="text-[14px] text-[#9E9890]">/unit</span>}
          </div>
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
