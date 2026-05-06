"use client"
import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [pwd, setPwd] = useState("")
  const [pwd2, setPwd2] = useState("")
  const [err, setErr] = useState("")
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    if (pwd !== pwd2) return setErr("Passwords do not match")
    if (pwd.length < 8) return setErr("Password must be at least 8 characters")
    setLoading(true)
    const { error } = await createClient().auth.signUp({
      email,
      password: pwd,
      options: { data: { full_name: name } },
    })
    setLoading(false)
    if (error) {
      const m = error.message.toLowerCase()
      if (m.includes("already")) setErr("Email already registered")
      else if (m.includes("weak")) setErr("Password is too weak")
      else setErr(error.message)
    } else setOk(true)
  }

  const inputCls =
    "w-full px-3.5 py-2.5 border border-[#C8C2BB] rounded-[10px] text-[14px] bg-white text-[#1A1A1A] placeholder:text-[#B0AAA2] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"

  if (ok)
    return (
      <div className="min-h-screen bg-[#EDE8DF] flex items-center justify-center">
        <div className="card p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-[18px] font-bold mb-2">Account Created!</h2>
          <p className="text-[14px] text-[#7A736A] mb-4">Check your email to confirm, then sign in.</p>
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Sign In →
          </Link>
        </div>
      </div>
    )

  return (
    <div className="min-h-screen bg-[#EDE8DF] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🥚</div>
          <h1 className="text-[28px] font-extrabold text-primary tracking-tight">EggSense</h1>
        </div>
        <div className="card p-8">
          <h2 className="text-[18px] font-bold text-[#1A1A1A] mb-5">Create Account</h2>
          <form onSubmit={submit} className="space-y-4">
            {[
              { label: "Business / Full Name", val: name, set: setName, type: "text", ph: "Your Business Name" },
              { label: "Email", val: email, set: setEmail, type: "email", ph: "you@business.com" },
              { label: "Password", val: pwd, set: setPwd, type: "password", ph: "Min 8 characters" },
              { label: "Confirm Password", val: pwd2, set: setPwd2, type: "password", ph: "Repeat password" },
            ].map(({ label, val, set, type, ph }) => (
              <div key={label}>
                <label className="block text-[11px] font-semibold text-[#7A736A] uppercase tracking-[0.05em] mb-1.5">{label}</label>
                <input required type={type} value={val} onChange={(e) => set(e.target.value)} placeholder={ph} className={inputCls} />
              </div>
            ))}
            {err && <p className="text-[13px] text-danger bg-red-50 rounded-lg px-3 py-2">{err}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary hover:bg-[#A33315] text-white font-semibold rounded-[10px] text-[14px] transition-colors disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>
          <p className="text-center text-[13px] text-[#7A736A] mt-4">
            Have an account?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
