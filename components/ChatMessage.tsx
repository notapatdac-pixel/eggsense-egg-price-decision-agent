import type { ChatMessage as Msg } from "@/lib/types"
export function ChatMessage({ msg, initial }: { msg: Msg; initial: string }) {
  const rec = msg.metadata as { type: string; recommended_units: number; estimated_savings: number } | null
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
          {msg.content}
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
        </div>
        <p className="text-[11px] text-[#B0AAA2] mt-1">{msg.timestamp ?? ""}</p>
      </div>
    </div>
  )
}
