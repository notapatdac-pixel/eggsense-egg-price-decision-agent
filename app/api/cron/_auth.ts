import type { NextRequest } from "next/server"

export function cronAuth(req: NextRequest): boolean {
  const h = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  return h === process.env.CRON_SECRET
}
