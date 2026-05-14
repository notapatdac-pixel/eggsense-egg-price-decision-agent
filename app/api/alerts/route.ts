import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAlerts, createAlert, deleteAlert, toggleAlert } from "@/lib/db"

export const runtime = "nodejs"

async function getUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : user
}

// GET /api/alerts — list all alerts for the authenticated user
export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const alerts = await getAlerts(user.id)
  return NextResponse.json({ alerts })
}

// POST /api/alerts — create a new price alert
// Body: { grade: "G2", alert_type: "ABOVE" | "BELOW", threshold_thb: 4.50 }
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { grade?: string; alert_type?: string; threshold_thb?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { grade, alert_type, threshold_thb } = body

  if (!grade || !alert_type || threshold_thb == null)
    return NextResponse.json({ error: "grade, alert_type, and threshold_thb are required" }, { status: 400 })

  if (!["ABOVE", "BELOW"].includes(alert_type))
    return NextResponse.json({ error: "alert_type must be ABOVE or BELOW" }, { status: 400 })

  if (!/^G[0-5]$/.test(grade))
    return NextResponse.json({ error: "grade must be G0–G5" }, { status: 400 })

  if (typeof threshold_thb !== "number" || threshold_thb <= 0 || threshold_thb > 20)
    return NextResponse.json({ error: "threshold_thb must be a positive number (0–20 THB)" }, { status: 400 })

  const result = await createAlert(user.id, grade, alert_type as "ABOVE" | "BELOW", threshold_thb)
  if (!result) return NextResponse.json({ error: "Failed to create alert" }, { status: 500 })

  return NextResponse.json({ id: result.id }, { status: 201 })
}

// PATCH /api/alerts — toggle active state
// Body: { id: number, is_active: boolean }
export async function PATCH(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { id?: number; is_active?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { id, is_active } = body
  if (id == null || is_active == null)
    return NextResponse.json({ error: "id and is_active are required" }, { status: 400 })

  const ok = await toggleAlert(user.id, id, is_active)
  if (!ok) return NextResponse.json({ error: "Failed to update alert" }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// DELETE /api/alerts?id=123 — delete an alert
export async function DELETE(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const id = parseInt(req.nextUrl.searchParams.get("id") ?? "")
  if (isNaN(id)) return NextResponse.json({ error: "id query param required" }, { status: 400 })

  const ok = await deleteAlert(user.id, id)
  if (!ok) return NextResponse.json({ error: "Failed to delete alert" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
