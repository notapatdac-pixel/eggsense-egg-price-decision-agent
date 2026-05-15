"use client"
import { useState, useRef, useEffect } from "react"
import { format } from "date-fns"
import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function PageHeader({ title, email }: { title: string; email: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function logout() {
    await createClient().auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">{title}</h2>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline text-[14px] text-[#9E9890]">{format(new Date(), "MMMM dd, yyyy")}</span>

        {/* Avatar + dropdown */}
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-9 h-9 rounded-full bg-[#3D3830] text-white flex items-center justify-center font-bold text-sm hover:bg-[#2A2520] transition-colors"
          >
            {email[0]?.toUpperCase()}
          </button>

          {open && (
            <div className="absolute right-0 top-11 w-52 bg-white border border-[#E5DDD4] rounded-xl shadow-lg py-2 z-50">
              <div className="px-4 py-2 border-b border-[#F0EBE3]">
                <p className="text-[11px] text-[#9E9890] font-medium">Signed in as</p>
                <p className="text-[13px] text-[#1A1A1A] font-semibold truncate mt-0.5">{email}</p>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] text-danger hover:bg-[#FEF0EC] transition-colors"
              >
                <LogOut size={14} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
