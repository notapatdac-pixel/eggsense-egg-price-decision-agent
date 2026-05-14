import { createClient as supabaseClient } from "@supabase/supabase-js"

export const db = () =>
  supabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

export const today = () => new Date().toISOString().split("T")[0]

export const ago = (d: number) => {
  const dt = new Date()
  dt.setDate(dt.getDate() - d)
  return dt.toISOString().split("T")[0]
}
