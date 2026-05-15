import Sidebar from "@/components/Sidebar"
import BottomNav from "@/components/BottomNav"

export default function DashboardShell({
  email,
  children,
}: {
  email: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-[#EDE8DF]">
      <Sidebar email={email} />
      <main className="md:ml-44 flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="p-4 md:p-7">{children}</div>
      </main>
      <BottomNav />
    </div>
  )
}
