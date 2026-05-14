import { NextResponse } from "next/server"
import { getTopQuestions, getQuestionTopicStats } from "@/lib/db"

export const runtime = "nodejs"

export async function GET() {
  const [questions, stats] = await Promise.all([
    getTopQuestions(8),
    getQuestionTopicStats(),
  ])
  return NextResponse.json({ questions, stats })
}
