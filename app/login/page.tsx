"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [pwd, setPwd] = useState("")
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    setLoading(true)
    const { error } = await createClient().auth.signInWithPassword({ email, password: pwd })
    setLoading(false)
    if (error) {
      const m = error.message.toLowerCase()
      if (m.includes("invalid")) setErr("Incorrect email or password")
      else if (m.includes("confirm")) setErr("Please confirm your email first")
      else if (m.includes("rate")) setErr("Too many attempts - please wait")
      else setErr(error.message)
    } else {
      router.push("/overview")
      router.refresh()
    }
  }

  const inputCls =
    "w-full px-3.5 py-2.5 border border-[#C8C2BB] rounded-[10px] text-[14px] bg-white text-[#1A1A1A] placeholder:text-[#B0AAA2] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"

  return (
    <div className="min-h-screen bg-[#EDE8DF] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🥚</div>
          <h1 className="text-[28px] font-extrabold text-primary tracking-tight">EggSense</h1>
          <p className="text-[14px] text-[#9E9890] mt-1">Egg price intelligence for your business</p>
        </div>
        <div className="card p-8">
          <h2 className="text-[18px] font-bold text-[#1A1A1A] mb-5">Sign In</h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#7A736A] uppercase tracking-[0.05em] mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#7A736A] uppercase tracking-[0.05em] mb-1.5">Password</label>
              <input
                type="password"
                required
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="••••••••"
                className={inputCls}
              />
            </div>
            {err && <p className="text-[13px] text-danger bg-red-50 rounded-lg px-3 py-2">{err}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary hover:bg-[#A33315] text-white font-semibold rounded-[10px] text-[14px] transition-colors disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <p className="text-center text-[13px] text-[#7A736A] mt-4">
            No account?{" "}
            <Link href="/register" className="text-primary font-semibold hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
