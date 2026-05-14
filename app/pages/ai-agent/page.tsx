import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { loadHistory, getAiProfile, getLatestEggPrice, db } from "@/lib/db"
import { PageHeader } from "@/components/PageHeader"
import DashboardShell from "@/components/DashboardShell"
import AgentPage from "./AgentPage"
import type { AgentSignal, Grade } from "@/lib/types"

export default async function AiAgent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [history, profile, signalRes] = await Promise.all([
    loadHistory(user.id, 20),
    getAiProfile(user.id),
    db().from("agent_signals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
  ])

  let latestSignal: AgentSignal | null = null
  const s = signalRes.data?.[0]
  if (s) {
    const grade = s.grade ? (parseInt(s.grade.replace("G", "")) as Grade) : 0
    const lastPrice = await getLatestEggPrice(grade)
    latestSignal = {
      action: s.action as "BUY NOW" | "HOLD" | "WAIT",
      grade: s.grade ?? undefined,
      quantity: s.quantity_rec ?? 0,
      strength: s.confidence >= 80 ? "Strong signal" : "Signal",  // kept as key; SignalBanner translates
      confidence: s.confidence ?? 0,
      context: s.market_context ?? "",
      last_price: lastPrice,
    }
  }

  return (
    <DashboardShell email={user.email ?? ""}>
      <div className="flex flex-col h-[calc(100vh-56px)]">
        <PageHeader title="AI Agent" email={user.email ?? ""} />
        <AgentPage
          initialHistory={history}
          email={user.email ?? ""}
          latestSignal={latestSignal}
        />
      </div>
    </DashboardShell>
  )
}
