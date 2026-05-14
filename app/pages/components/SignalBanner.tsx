import type { AgentSignal } from "@/lib/types"
const BG = { "BUY NOW": "#2A6830", HOLD: "#8B4A10", WAIT: "#3D3830" }
const ICON = { "BUY NOW": "🛡️", HOLD: "⏸️", WAIT: "⏳" }
export function SignalBanner({ s }: { s: AgentSignal }) {
  return (
    <div className="mb-4">
      <div className="px-5 py-3 rounded-t-[10px] flex justify-between items-center text-white font-bold text-[15px]" style={{ background: BG[s.action] }}>
        <span>
          {ICON[s.action]} {s.action} · {s.quantity} Unit · {s.strength}
        </span>
        <span className="text-[12px] font-medium opacity-90">CONFIDENCE: {s.confidence}%</span>
      </div>
      <div className="bg-white border border-[#E5DDD4] border-t-0 rounded-b-[10px] px-5 py-3.5 flex justify-between items-center">
        <div className="flex-1 pr-6">
          <p className="text-[11px] font-semibold text-[#9E9890] uppercase tracking-[0.06em] mb-1">Market Context</p>
          <p className="text-[14px] text-[#3D3830] leading-snug">{s.context}</p>
        </div>
        <div className="text-right border-l border-[#E5DDD4] pl-5 min-w-[110px]">
          <p className="text-[11px] font-semibold text-[#9E9890] uppercase tracking-[0.06em] mb-1">Last Price</p>
          <p className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">฿ {s.last_price.toFixed(2)}</p>
        </div>
      </div>
    </div>
  )
}
