import { db } from "./client"

const THIRTY_DAYS_MS = 30 * 86_400_000

export async function trackQuestion(text: string, topic: string): Promise<void> {
  const { error } = await db()
    .from("question_analytics")
    .insert({ question_text: text.slice(0, 300), topic })
  if (error) console.error("trackQuestion:", error.message)
}

export async function getTopQuestions(limit = 8): Promise<Array<{ text: string; topic: string; count: number }>> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
  const { data, error } = await db()
    .from("question_analytics")
    .select("question_text, topic")
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error || !data) return []

  const counts = new Map<string, { text: string; topic: string; count: number }>()
  for (const row of data) {
    const key = row.question_text.toLowerCase().trim()
    const existing = counts.get(key)
    if (existing) existing.count++
    else counts.set(key, { text: row.question_text, topic: row.topic, count: 1 })
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export async function getQuestionTopicStats(): Promise<Array<{ topic: string; count: number }>> {
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
  const { data, error } = await db()
    .from("question_analytics")
    .select("topic")
    .gt("created_at", since)
  if (error || !data) return []

  const counts = new Map<string, number>()
  for (const row of data) counts.set(row.topic, (counts.get(row.topic) ?? 0) + 1)

  return Array.from(counts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
}
