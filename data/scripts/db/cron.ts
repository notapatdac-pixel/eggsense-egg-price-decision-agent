import { db } from "./client"

export async function logCron(
  job: string,
  status: "success" | "failed" | "partial",
  ms: number,
  rows = 0,
  err?: string
): Promise<void> {
  try {
    await db().from("cron_log").insert({
      job_name: job,
      status,
      duration_ms: ms,
      rows_inserted: rows,
      error_msg: err ?? null,
    })
  } catch {}
}
