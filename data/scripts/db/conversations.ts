import type { ChatMessage } from "@/lib/types"
import { db } from "./client"

export async function loadHistory(userId: string, limit = 20): Promise<ChatMessage[]> {
  const { data, error } = await db()
    .from("ai_conversations")
    .select("role,content,metadata,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) { console.error("loadHistory:", error.message, error.code); return [] }
  return (data ?? []).map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content as string,
    metadata: r.metadata as Record<string, unknown> | null,
    timestamp: (r.created_at as string)?.slice(11, 16),
  }))
}

export async function saveMsg(
  userId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  const { error } = await db()
    .from("ai_conversations")
    .insert({ user_id: userId, role, content, metadata: metadata ?? null })
  if (error) console.error("saveMsg error:", error.message, "code:", error.code, "details:", error.details)
}
