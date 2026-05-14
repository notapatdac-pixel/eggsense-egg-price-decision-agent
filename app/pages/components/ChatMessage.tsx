"use client"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import type { ChatMessage as Msg } from "@/lib/types"

function MdContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        p:      ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul:     ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
        ol:     ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
        li:     ({ children }) => <li className="leading-snug">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-[#1A1A1A]">{children}</strong>,
        em:     ({ children }) => <em className="italic">{children}</em>,
        hr:     () => <hr className="my-2 border-[#E5DDD4]" />,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

const TOOL_META: Record<string, { icon: string; label: string }> = {
  get_current_prices:  { icon: "💰", label: "Live Prices" },
  get_price_forecast:  { icon: "📈", label: "14-Day Forecast" },
  get_market_news:     { icon: "📰", label: "Market News" },
  calculate_inventory: { icon: "📦", label: "Inventory Calc" },
  get_market_context:  { icon: "🌡️", label: "Market Context" },
}

const SPECIALIST_META: Record<string, { icon: string; label: string }> = {
  price:     { icon: "💰", label: "Price Analyst" },
  forecast:  { icon: "📈", label: "Forecast Analyst" },
  buying:    { icon: "🛒", label: "Buying Advisor" },
  news:      { icon: "📰", label: "Market Intelligence" },
  inventory: { icon: "📦", label: "Inventory Optimizer" },
  general:   { icon: "🤖", label: "General Advisor" },
}

function ReasoningPanel({ toolTrace, specialist, historyCount }: {
  toolTrace: Array<{ tool: string; summary: string; failed?: boolean }>
  specialist: string | null
  historyCount: number
}) {
  const [open, setOpen] = useState(false)
  const specMeta = SPECIALIST_META[specialist ?? "general"] ?? SPECIALIST_META.general
  const failedCount = toolTrace.filter((t) => t.failed).length

  return (
    <div className="mt-3 border-t border-[#E5DDD4] pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[11px] text-[#9E9890] hover:text-[#7A736A] transition-colors w-full text-left"
      >
        <span className="transition-transform duration-200" style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <span>
          {specMeta.icon} {specMeta.label}
          {" · "}{toolTrace.length} tool{toolTrace.length !== 1 ? "s" : ""}
          {failedCount > 0 ? ` · ⚠️ ${failedCount} retried` : ""}
          {historyCount > 0 ? ` · 💬 ${historyCount} turns` : ""}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {/* Specialist Agent badge */}
          <div className="flex items-center gap-2 bg-[#EDE8DF] rounded-lg px-3 py-1.5">
            <span className="text-[13px]">{specMeta.icon}</span>
            <div>
              <span className="text-[10px] font-semibold text-[#7A736A] uppercase tracking-wide">Specialist Agent</span>
              <p className="text-[11px] text-[#3D3830]">{specMeta.label} — routed by Planner Agent</p>
            </div>
          </div>

          {/* Memory badge */}
          {historyCount > 0 && (
            <div className="flex items-center gap-2 bg-[#EDE8DF] rounded-lg px-3 py-1.5">
              <span className="text-[13px]">💬</span>
              <div>
                <span className="text-[10px] font-semibold text-[#7A736A] uppercase tracking-wide">Session Memory</span>
                <p className="text-[11px] text-[#3D3830]">{historyCount} prior conversation turn{historyCount !== 1 ? "s" : ""} loaded from database</p>
              </div>
            </div>
          )}

          {/* Tool call steps */}
          {toolTrace.map((tc, i) => {
            const meta = TOOL_META[tc.tool] ?? { icon: "🔧", label: tc.tool }
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg px-3 py-1.5 ${tc.failed ? "bg-[#FEF3F2] border border-[#FECDCA]" : "bg-[#F5F0EB]"}`}
              >
                <span className="text-[13px] mt-0.5 flex-shrink-0">{tc.failed ? "⚠️" : meta.icon}</span>
                <div className="min-w-0">
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${tc.failed ? "text-[#B42318]" : "text-[#7A736A]"}`}>
                    {meta.label}{tc.failed ? " · retried" : ""}
                  </p>
                  <p className="text-[11px] text-[#3D3830] leading-snug">{tc.summary}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ChatMessage({ msg, initial }: { msg: Msg; initial: string }) {
  const meta = msg.metadata as Record<string, unknown> | null | undefined
  const rec = meta as { type?: string; recommended_units?: number; estimated_savings?: number } | null
  const toolTrace = meta?.toolTrace as Array<{ tool: string; summary: string; failed?: boolean }> | undefined
  const specialist = meta?.specialist as string | undefined
  const historyCount = (meta?.historyCount as number | undefined) ?? 0

  if (msg.role === "user")
    return (
      <div className="flex justify-end items-end gap-2.5 mb-4 px-1">
        <div className="max-w-[76%]">
          <div className="bg-primary text-white px-4 py-3 text-[14px] leading-relaxed" style={{ borderRadius: "16px 4px 16px 16px" }}>
            {msg.content}
          </div>
          <p className="text-[11px] text-[#B0AAA2] text-right mt-1">{msg.timestamp ?? ""}</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-[#3D3830] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
          {initial}
        </div>
      </div>
    )
  return (
    <div className="flex items-start gap-2.5 mb-4 px-1">
      <div className="w-9 h-9 rounded-full bg-[#3D3830] flex items-center justify-center text-base flex-shrink-0 mt-0.5">🥚</div>
      <div className="max-w-[76%]">
        <div
          className="bg-white text-[#3D3830] px-4 py-3 text-[14px] leading-relaxed border border-[#E5DDD4] shadow-sm"
          style={{ borderRadius: "4px 16px 16px 16px" }}
        >
          <MdContent text={msg.content} />
          {rec?.type === "recommendation" && (
            <div className="mt-3 bg-[#F5F0EB] rounded-lg p-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold text-[#9E9890] uppercase tracking-widest mb-1">Recommended</p>
                <p className="text-[16px] font-bold text-[#1A1A1A]">{rec.recommended_units} Unit</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[#9E9890] uppercase tracking-widest mb-1">Estimated Savings</p>
                <p className="text-[16px] font-bold text-[#1A1A1A]">฿{rec.estimated_savings}</p>
              </div>
            </div>
          )}
          {toolTrace && toolTrace.length > 0 && (
            <ReasoningPanel
              toolTrace={toolTrace}
              specialist={specialist ?? null}
              historyCount={historyCount}
            />
          )}
        </div>
        <p className="text-[11px] text-[#B0AAA2] mt-1">{msg.timestamp ?? ""}</p>
      </div>
    </div>
  )
}
