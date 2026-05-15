"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Bot, BarChart2 } from "lucide-react"
import clsx from "clsx"

const NAV = [
  { label: "Overview", href: "/pages/overview", icon: LayoutDashboard },
  { label: "AI Agent", href: "/pages/ai-agent", icon: Bot },
  { label: "Profile", href: "/pages/business-profile", icon: BarChart2 },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#DDD7CE] flex md:hidden z-30 safe-bottom">
      {NAV.map(({ label, href, icon: Icon }) => {
        const active = path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-[#9E9890]"
            )}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
