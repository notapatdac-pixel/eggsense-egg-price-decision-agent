import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getAllGradesLatest } from "@/lib/db"
import { PageHeader } from "@/components/PageHeader"
import DashboardShell from "@/components/DashboardShell"
import OverviewPage from "@/app/pages/OverviewPage"

export default async function Overview() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const grades = await getAllGradesLatest()

  return (
    <DashboardShell email={user.email ?? ""}>
      <PageHeader title="Overview" email={user.email ?? ""} />
      <OverviewPage grades={grades} />
    </DashboardShell>
  )
}
