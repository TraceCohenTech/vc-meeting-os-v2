import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { MobileNav } from '@/components/MobileNav'
import { FeedbackButton } from '@/components/FeedbackButton'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Desktop Sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar user={user} />
      </div>

      {/* Mobile Navigation */}
      <MobileNav user={user} />

      {/* Main content - with top padding on mobile for fixed header */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
      <FeedbackButton />
    </div>
  )
}
