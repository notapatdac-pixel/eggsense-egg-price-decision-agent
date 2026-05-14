"use client"
import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { SignalBanner } from "@/components/SignalBanner"
import { ChatMessage } from "@/components/ChatMessage"
import type { ChatMessage as Msg, AgentSignal, AgentResult } from "@/lib/types"

// Client-side specialist prediction — mirrors the server-side planner rules.
// Shown immediately when the user sends; confirmed/corrected by the actual response.
function predictSpecialist(message: string): { icon: string; label: string } {
  const t = message.toLowerCase()
  if (/forecast|แนวโน้ม|พยากรณ์|จะขึ้น|จะลง|next week|สัปดาห์หน้า|predict|คาด/.test(t))
    return { icon: "📈", label: "Forecast Analyst" }
  if (/should i buy|ควรซื้อ|buy now|ซื้อตอนนี้|สต็อก(?!ก)|ควรสต็อก/.test(t))
    return { icon: "🛒", label: "Buying Advisor" }
  if (/news|ข่าว|disease|โรค|bird flu|ไข้หวัด|น้ำมัน|diesel|factor|ปัจจัย|กระทบ/.test(t))
    return { icon: "📰", label: "Market Intelligence" }
  if (/inventory|calculate|คำนวณ|cost.*month|ต้นทุน|monthly|เดือนละ/.test(t))
    return { icon: "📦", label: "Inventory Optimizer" }
  if (/ราคา|price|today|วันนี้|เท่าไหร่|กี่บาท|how much/.test(t))
    return { icon: "💰", label: "Price Analyst" }
  return { icon: "🤖", label: "General Advisor" }
}

const FALLBACK_CHIPS = [
  "ราคาไข่วันนี้เป็นยังไง?",
  "ควรซื้อสต็อกตอนนี้ไหม?",
  "แนวโน้มราคาสัปดาห์หน้า",
  "ปัจจัยอะไรกระทบราคาไข่บ้าง?",
]

export default function AgentPage({
  initialHistory,
  email,
  latestSignal,
}: {
  initialHistory: Msg[]
  email: string
  latestSignal: AgentSignal | null
}) {
  const [messages, setMessages] = useState<Msg[]>(initialHistory)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [pendingSpecialist, setPendingSpecialist] = useState<{ icon: string; label: string } | null>(null)
  const [signal, setSignal] = useState<AgentSignal | null>(latestSignal)
  const [chips, setChips] = useState<string[]>(FALLBACK_CHIPS)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initial = email[0]?.toUpperCase() ?? "U"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, sending])

  // Load popular questions from DB as initial chips (only when no chat history)
  useEffect(() => {
    if (initialHistory.length > 0) return
    fetch("/api/questions")
      .then((r) => r.json())
      .then((d: { questions?: Array<{ text: string }> }) => {
        const texts = (d.questions ?? []).slice(0, 4).map((q) => q.text)
        if (texts.length >= 2) setChips(texts)
      })
      .catch(() => {})
  }, [initialHistory.length])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setInput("")
    setPendingSpecialist(predictSpecialist(trimmed))

    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    setMessages((prev) => [...prev, { role: "user", content: trimmed, timestamp: now }])

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })
      const data = (await res.json()) as AgentResult
      const ts = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.text,
          metadata: {
            ...(data.metadata as Record<string, unknown> ?? {}),
            ...(data.toolTrace?.length ? { toolTrace: data.toolTrace } : {}),
            ...(data.plannerIntent ? { plannerIntent: data.plannerIntent } : {}),
            ...(data.specialist ? { specialist: data.specialist } : {}),
            historyCount: data.historyCount ?? 0,
          },
          timestamp: ts,
        },
      ])
      if (data.signal) setSignal(data.signal as AgentSignal)
      if (data.suggestedQuestions?.length) setChips(data.suggestedQuestions)
    } catch {
      const ts = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection error. Please try again.", timestamp: ts },
      ])
    } finally {
      setSending(false)
      setPendingSpecialist(null)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {signal && <SignalBanner s={signal} />}

      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {messages.length === 0 && (
          <div className="flex items-start gap-2.5 px-1 mb-4">
            <div className="w-9 h-9 rounded-full bg-[#3D3830] flex items-center justify-center text-base flex-shrink-0 mt-0.5">
              🥚
            </div>
            <div
              className="bg-white text-[#3D3830] px-4 py-3 text-[14px] leading-relaxed border border-[#E5DDD4] shadow-sm max-w-[76%]"
              style={{ borderRadius: "4px 16px 16px 16px" }}
            >
              Hello! I&apos;m EggSense AI. I can help you make smarter egg purchasing decisions using live DIT prices,
              weather, oil trends, and disease alerts. What would you like to know?
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} msg={msg} initial={initial} />
        ))}
        {sending && (
          <div className="flex items-start gap-2.5 px-1 mb-4">
            <div className="w-9 h-9 rounded-full bg-[#3D3830] flex items-center justify-center text-base flex-shrink-0 mt-0.5">
              🥚
            </div>
            <div
              className="bg-white border border-[#E5DDD4] px-4 py-3 text-[14px]"
              style={{ borderRadius: "4px 16px 16px 16px" }}
            >
              <div className="flex items-center gap-2 text-[#B0AAA2]">
                <span className="animate-pulse">🧠</span>
                <span className="text-[12px] text-[#B0AAA2]">Planner →</span>
                {pendingSpecialist && (
                  <>
                    <span>{pendingSpecialist.icon}</span>
                    <span className="text-[12px] text-[#7A736A] font-medium animate-pulse">{pendingSpecialist.label} thinking…</span>
                  </>
                )}
                {!pendingSpecialist && <span className="animate-pulse text-[12px]">routing…</span>}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 flex-wrap pt-3 pb-2">
        {chips.map((chip, i) => (
          <button
            key={i}
            onClick={() => send(chip)}
            disabled={sending}
            className="px-4 py-2 text-[13px] border border-[#DDD7CE] rounded-full text-[#3D3830] hover:bg-[#F5F0EB] transition-colors disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-white border border-[#DDD7CE] rounded-xl px-4 py-2.5 mt-1">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="Ask about egg prices..."
          className="flex-1 text-[14px] text-[#1A1A1A] placeholder:text-[#B0AAA2] outline-none bg-transparent"
          disabled={sending}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || sending}
          className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-[#A33315] transition-colors disabled:opacity-40 flex-shrink-0"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
