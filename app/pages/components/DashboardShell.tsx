import Sidebar from "@/components/Sidebar"

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
      <main className="ml-44 flex-1 overflow-y-auto">
        <div className="p-7">{children}</div>
      </main>
    </div>
  )
}
