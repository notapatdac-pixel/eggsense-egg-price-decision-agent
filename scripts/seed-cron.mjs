#!/usr/bin/env node
// Run all cron jobs against the local dev server in sequence.
// Usage: node scripts/seed-cron.mjs
//   or:  npm run seed-cron

import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dir = dirname(fileURLToPath(import.meta.url))
const ENV_FILES = ["../.env.local", "../.env"]

let secret = process.env.CRON_SECRET
if (!secret) {
  for (const f of ENV_FILES) {
    try {
      const lines = readFileSync(resolve(__dir, f), "utf8").split("\n")
      const line = lines.find((l) => l.startsWith("CRON_SECRET="))
      secret = line?.split("=")[1]?.trim()
      if (secret) break
    } catch { /* file not found, try next */ }
  }
}

if (!secret) {
  console.error("❌  CRON_SECRET not found. Set it in .env.local or export it.")
  process.exit(1)
}

const BASE = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
const JOBS = ["/api/cron/oil", "/api/cron/weather", "/api/cron/eggs", "/api/cron/feedcosts", "/api/cron/disease", "/api/cron/embed"]

for (const job of JOBS) {
  process.stdout.write(`→ ${job} ... `)
  try {
    const res = await fetch(`${BASE}${job}`, { headers: { "x-cron-secret": secret } })
    const text = await res.text()
    let msg
    try { msg = JSON.parse(text)?.message ?? text } catch { msg = text }
    console.log(res.ok ? `✅ ${msg}` : `❌ ${res.status} ${msg}`)
  } catch (e) {
    console.log(`❌ ${e.message}`)
  }
}
