import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getAiProfile } from "@/lib/db"
import { PageHeader } from "@/components/PageHeader"
import DashboardShell from "@/components/DashboardShell"
import ProfilePage from "@/app/pages/ProfilePage"

export default async function BusinessProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const profile = await getAiProfile(user.id)

  return (
    <DashboardShell email={user.email ?? ""}>
      <PageHeader title="Business Profile" email={user.email ?? ""} />
      <ProfilePage profile={profile} />
    </DashboardShell>
  )
}
