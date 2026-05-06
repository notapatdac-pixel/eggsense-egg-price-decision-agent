"use client"
import { useState, useEffect } from "react"
import { GradeCard } from "@/components/GradeCard"
import { NewsCard } from "@/components/NewsCard"
import { ForecastChart } from "@/components/charts/ForecastChart"
import type { GradePrice, PricePoint, ForecastPoint, OilPoint, NewsItem } from "@/lib/types"

const GRADES = [0, 1, 2, 3, 4, 5]

export default function OverviewPage({ grades }: { grades: GradePrice[] }) {
  const [activeGrade, setActiveGrade] = useState(2)
  const [historical, setHistorical] = useState<PricePoint[]>([])
  const [forecast, setForecast] = useState<ForecastPoint[]>([])
  const [oil, setOil] = useState<OilPoint[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [visibleCount, setVisibleCount] = useState(4)
  const [newsLoading, setNewsLoading] = useState(true)
  const today = new Date().toISOString().split("T")[0]

  // Fetch chart data when grade changes
  useEffect(() => {
    setChartLoading(true)
    Promise.all([
      fetch(`/api/prices?grade=${activeGrade}&days=60`).then((r) => r.json()),
      fetch(`/api/forecast?grade=${activeGrade}`).then((r) => r.json()),
    ])
      .then(([prices, fc]) => {
        setHistorical(prices.history ?? [])
        setOil(prices.oil ?? [])
        setForecast(fc.forecast ?? [])
      })
      .finally(() => setChartLoading(false))
  }, [activeGrade])

  // Fetch 12 news items once; show 4 initially with Load More
  useEffect(() => {
    setNewsLoading(true)
    fetch("/api/news?type=general&limit=12")
      .then((r) => r.json())
      .then((d) => setAllNews(d.news ?? []))
      .catch(() => setAllNews([]))
      .finally(() => setNewsLoading(false))
  }, [])

  return (
    <div className="space-y-5">
      {/* Grade cards */}
      <div className="grid grid-cols-6 gap-3">
        {grades.map((g) => (
          <button
            key={g.grade}
            onClick={() => setActiveGrade(g.grade)}
            className={`text-left rounded-[14px] transition-all ${activeGrade === g.grade ? "ring-2 ring-primary" : ""}`}
          >
            <GradeCard data={g} />
          </button>
        ))}
      </div>

      {/* Price chart */}
      <div className="card p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[16px] font-bold text-[#1A1A1A]">Price History & Forecast</h3>
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
                G{g}
              </button>
            ))}
          </div>
        </div>
        {chartLoading ? (
          <div className="h-[260px] flex items-center justify-center text-[#9E9890] text-sm">Loading…</div>
        ) : (
          <ForecastChart
            historical={historical}
            forecast={forecast}
            oil={oil}
            today={today}
            showOil={false}
            personalized={false}
            grade={activeGrade}
          />
        )}
      </div>

      {/* News */}
      <div>
        <h3 className="text-[16px] font-bold text-[#1A1A1A] mb-3">Market News</h3>
        {newsLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card h-[220px] animate-pulse bg-[#F5F0EB]" />
            ))}
          </div>
        ) : allNews.length === 0 ? (
          <p className="text-[13px] text-[#9E9890]">No news available.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              {allNews.slice(0, visibleCount).map((n, i) => (
                <NewsCard key={i} item={n} />
              ))}
            </div>
            {visibleCount < allNews.length && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setVisibleCount((c) => c + 4)}
                  className="px-5 py-2 text-[13px] font-semibold border border-[#DDD7CE] rounded-full text-[#3D3830] hover:bg-[#F5F0EB] transition-colors"
                >
                  Load more news
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
