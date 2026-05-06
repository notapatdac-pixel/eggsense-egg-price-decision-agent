"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { LayoutDashboard, Bot, BarChart2, LogOut } from "lucide-react"
import clsx from "clsx"

const NAV = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "AI Agent", href: "/ai-agent", icon: Bot },
  { label: "Business Profile", href: "/business-profile", icon: BarChart2 },
]

export default function Sidebar({ email }: { email: string }) {
  const path = usePathname()
  const router = useRouter()
  async function logout() {
    await createClient().auth.signOut()
    router.push("/login")
    router.refresh()
  }
  return (
    <aside className="fixed left-0 top-0 h-screen w-44 bg-white border-r border-[#DDD7CE] flex flex-col z-20">
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-[#EDE8DF]">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-base flex-shrink-0">🥚</div>
        <span className="text-[17px] font-extrabold text-[#1A1A1A] tracking-tight">EggSense</span>
      </div>
      <nav className="flex-1 px-2 pt-3 space-y-0.5">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors rounded-r-[9px] border-l-[3px]",
                active
                  ? "bg-[#FEF0EC] border-primary text-primary font-semibold"
                  : "border-transparent text-[#7A736A] hover:bg-[#F9F5F0] hover:text-[#3D3830]"
              )}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-[#EDE8DF] p-3">
        <button
          onClick={logout}
          className="flex items-center gap-2 text-[12px] text-[#9E9890] hover:text-danger transition-colors w-full"
        >
          <LogOut size={14} />
          Log out
        </button>
      </div>
    </aside>
  )
}
