import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ensureUser, getAiProfile, loadHistory, saveMsg, upsertAiProfile, saveSignal } from "@/lib/db"
import { runAgentTurn } from "@/agent/main"
import { retrieveContext } from "@/agent/tools/rag"
import type { AiProfile } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const message = body.message?.trim()
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 })

  // Guarantee user row exists before FK-constrained inserts
  await ensureUser(user.id, user.email)
  const [profile, history, rag] = await Promise.all([getAiProfile(user.id), loadHistory(user.id, 20), retrieveContext(message, 4)])

  try {
    const result = await runAgentTurn(user.id, message, history, profile, rag)

    await Promise.all([
      saveMsg(user.id, "user", message),
      saveMsg(user.id, "assistant", result.text, result.metadata ?? undefined),
      result.profileUpdate ? upsertAiProfile(user.id, result.profileUpdate as Partial<AiProfile>) : Promise.resolve(),
      result.signal
        ? saveSignal(user.id, {
            action: result.signal.action,
            grade: result.signal.grade,
            quantity: result.signal.quantity,
            confidence: result.signal.confidence,
            context: result.signal.context,
          })
        : Promise.resolve(),
    ])

    return NextResponse.json(result)
  } catch (e) {
    console.error("[api/agent]", e)
    return NextResponse.json({
      text: "I'm having trouble connecting right now. Please try again in a moment.",
      metadata: null,
      signal: null,
      suggestedQuestions: null,
      profileUpdate: null,
    })
  }
}
