"use client"
import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import { SignalBanner } from "@/components/SignalBanner"
import { ChatMessage } from "@/components/ChatMessage"
import type { ChatMessage as Msg, AgentSignal, AgentResult } from "@/lib/types"

const DEFAULT_CHIPS = [
  "Execute 30 tray purchase",
  "Show price trend graph",
  "Compare local suppliers",
  "Forecast for next week",
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
  const [signal, setSignal] = useState<AgentSignal | null>(latestSignal)
  const [chips, setChips] = useState<string[]>(DEFAULT_CHIPS)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initial = email[0]?.toUpperCase() ?? "U"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, sending])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setInput("")

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
          metadata: data.metadata ?? undefined,
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
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {signal && <SignalBanner s={signal} />}

      {/* Messages area */}
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
              className="bg-white border border-[#E5DDD4] px-4 py-3 text-[#B0AAA2] text-[14px]"
              style={{ borderRadius: "4px 16px 16px 16px" }}
            >
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested question chips */}
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

      {/* Input bar */}
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
