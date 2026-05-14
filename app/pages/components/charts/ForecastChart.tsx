"use client"
import { useMemo } from "react"
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts"
import type { PricePoint, ForecastPoint, OilPoint } from "@/lib/types"

const GRADE_COLOR: Record<number, string> = {
  0: "#C5401A",
  1: "#2D6BE4",
  2: "#16A34A",
  3: "#D97706",
  4: "#7C3AED",
  5: "#0891B2",
}

function Tip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || !payload.length) return null
  const ds = new Date((label as string) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  return (
    <div className="bg-[#1A1A1A] text-white px-3 py-2 rounded-lg text-[11px] shadow-xl min-w-[160px]">
      <p className="font-bold mb-1 text-[12px]">{ds}</p>
      {(payload as Array<{ name: string; value: number; color: string }>)
        .filter((p) => p.value != null)
        .map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span>
              {p.name}: ฿{p.value.toFixed(2)}
              {p.name === "OIL TREND" ? "/L" : "/unit"}
            </span>
          </div>
        ))}
    </div>
  )
}

interface Props {
  historical: PricePoint[]
  forecast: ForecastPoint[]
  oil: OilPoint[]
  today: string
  showOil: boolean
  personalized: boolean
  grade: number
}

export function ForecastChart({ historical, forecast, oil, today, showOil, personalized, grade }: Props) {
  const histColor = GRADE_COLOR[grade] ?? "#C5401A"
  const fcLabel = personalized ? "FORECAST" : "AI FORECAST"
  const data = useMemo(() => {
    const m: Record<string, Record<string, unknown>> = {}
    historical.forEach((d) => {
      m[d.date] = { date: d.date, h: d.price }
    })
    forecast.forEach((d) => {
      m[d.date] = { ...(m[d.date] ?? { date: d.date }), f: d.price }
    })
    if (showOil)
      oil.forEach((d) => {
        if (m[d.date]) m[d.date].o = d.diesel_price
      })
    const lastH = Object.keys(m)
      .filter((k) => m[k].h != null)
      .sort()
      .slice(-1)[0]
    if (lastH) m[lastH].f = m[lastH].h
    return Object.values(m).sort((a, b) => (a.date as string).localeCompare(b.date as string))
  }, [historical, forecast, oil, showOil])

  const todayP = (data.find((d) => d.date === today)?.h as number) ?? null
  function fmtX(v: unknown, i: number) {
    const step = Math.floor(data.length / 3)
    if (i === 0 || i === step || i === data.length - 1)
      return new Date((v as string) + "T00:00:00")
        .toLocaleDateString("en-US", { month: "short", year: "numeric" })
        .toUpperCase()
    return ""
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 16, right: showOil ? 58 : 16, left: 4, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EDE8DF" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtX}
          interval={0}
          tick={{ fill: "#9E9890", fontSize: 11 }}
          axisLine={{ stroke: "#E5DDD4" }}
          tickLine={false}
        />
        <YAxis
          yAxisId="egg"
          tickFormatter={(v) => `฿${v.toFixed(2)}`}
          tick={{ fill: "#9E9890", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={62}
          domain={([min, max]: readonly number[]) => {
            const pad = Math.max((max - min) * 0.3, 0.15)
            return [Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10]
          }}
        />
        {showOil && (
          <YAxis
            yAxisId="oil"
            orientation="right"
            tickFormatter={(v) => `฿${v.toFixed(1)}/L`}
            tick={{ fill: "#C8C2BB", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={58}
          />
        )}
        <Tooltip content={<Tip />} />
        <Legend
          verticalAlign="top"
          align="right"
          wrapperStyle={{ fontSize: 11, paddingBottom: 12 }}
          formatter={(v) => <span style={{ color: "#7A736A", fontSize: 11 }}>{v}</span>}
          iconType="plainline"
        />
        {todayP != null && (
          <ReferenceLine
            yAxisId="egg"
            x={today}
            stroke="#A09890"
            strokeDasharray="4 2"
            strokeWidth={1.5}
            label={{
              value: `Today: ฿${todayP.toFixed(2)}`,
              position: "insideTopRight",
              fill: "#1A1A1A",
              fontSize: 11,
              fontWeight: 700,
            }}
          />
        )}
        <Line
          yAxisId="egg"
          type="monotone"
          dataKey="h"
          name="HISTORICAL DATA"
          stroke={histColor}
          strokeWidth={2.5}
          dot={false}
          connectNulls={false}
          activeDot={{ r: 5, fill: histColor, stroke: "#FFF", strokeWidth: 2 }}
        />
        <Line
          yAxisId="egg"
          type="monotoneX"
          dataKey="f"
          name={fcLabel}
          stroke="#2D6BE4"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          connectNulls={false}
          activeDot={{ r: 5, fill: "#2D6BE4", stroke: "#FFF", strokeWidth: 2 }}
        />
        {showOil && (
          <Line
            yAxisId="oil"
            type="monotone"
            dataKey="o"
            name="OIL TREND"
            stroke="#B0AAA2"
            strokeWidth={1.5}
            strokeDasharray="2 4"
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
