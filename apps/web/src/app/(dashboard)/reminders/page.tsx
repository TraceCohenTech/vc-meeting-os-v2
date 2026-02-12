import { createClient } from '@/lib/supabase/server'
import {
  Bell,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Handshake,
  Users,
  CalendarClock,
  UserPlus,
} from 'lucide-react'
import { ReminderList } from './ReminderList'
import { GenerateStaleButton } from './GenerateStaleButton'

interface SearchParams {
  status?: string
  type?: string
}

const typeLabels: Record<string, string> = {
  commitment: 'Commitments',
  stale_relationship: 'Reconnect',
  follow_up: 'Follow-ups',
  deadline: 'Deadlines',
  intro_request: 'Intros',
}

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const statusFilter = params.status || 'pending'
  const typeFilter = params.type || 'all'

  // Fetch reminders
  let query = supabase
    .from('reminders')
    .select(`
      *,
      contacts (id, name, email),
      companies (id, name),
      memos (id, title)
    `)
    .eq('user_id', user!.id)

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  if (typeFilter !== 'all') {
    query = query.eq('type', typeFilter)
  }

  // Exclude snoozed reminders that aren't due yet
  if (statusFilter === 'pending') {
    query = query.or('snoozed_until.is.null,snoozed_until.lte.now()')
  }

  query = query.order('due_date', { ascending: true, nullsFirst: false })

  const { data: reminders, error } = await query

  // Get counts by status
  const { data: statusData } = await supabase
    .from('reminders')
    .select('status')
    .eq('user_id', user!.id)

  const statusCounts = (statusData as Array<{ status: string }> | null)?.reduce(
    (acc, { status }) => {
      acc[status] = (acc[status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  ) || {}

  // Get counts by type (for pending only)
  const { data: typeData } = await supabase
    .from('reminders')
    .select('type')
    .eq('user_id', user!.id)
    .eq('status', 'pending')

  const typeCounts = (typeData as Array<{ type: string }> | null)?.reduce(
    (acc, { type }) => {
      acc[type] = (acc[type] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  ) || {}

  // Count overdue
  type ReminderItem = { status: string; due_date: string | null }
  const overdueCount = (reminders as ReminderItem[] | null)?.filter(
    (r) => r.status === 'pending' && r.due_date && new Date(r.due_date) < new Date()
  ).length || 0

  const statusTabs = [
    { value: 'pending', label: 'Active', icon: Clock, count: statusCounts.pending || 0 },
    { value: 'snoozed', label: 'Snoozed', icon: Clock, count: statusCounts.snoozed || 0 },
    { value: 'completed', label: 'Done', icon: CheckCircle2, count: statusCounts.completed || 0 },
    { value: 'dismissed', label: 'Dismissed', icon: XCircle, count: statusCounts.dismissed || 0 },
    { value: 'all', label: 'All', icon: Bell, count: Object.values(statusCounts).reduce((a, b) => a + b, 0) },
  ]

  const typeTabs = [
    { value: 'all', label: 'All Types', count: Object.values(typeCounts).reduce((a, b) => a + b, 0) },
    { value: 'commitment', label: 'Commitments', icon: Handshake, count: typeCounts.commitment || 0 },
    { value: 'stale_relationship', label: 'Reconnect', icon: Users, count: typeCounts.stale_relationship || 0 },
    { value: 'follow_up', label: 'Follow-ups', icon: CalendarClock, count: typeCounts.follow_up || 0 },
    { value: 'intro_request', label: 'Intros', icon: UserPlus, count: typeCounts.intro_request || 0 },
    { value: 'deadline', label: 'Deadlines', icon: Clock, count: typeCounts.deadline || 0 },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Reminders</h1>
          <p className="text-slate-400 mt-1">
            Smart follow-ups extracted from your meetings
          </p>
        </div>
        <GenerateStaleButton />
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && statusFilter === 'pending' && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-red-300">
            You have <span className="font-semibold">{overdueCount}</span> overdue reminder
            {overdueCount !== 1 ? 's' : ''} that need attention
          </p>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {statusTabs.map((tab) => {
          const isActive = tab.value === statusFilter
          return (
            <a
              key={tab.value}
              href={`/reminders?status=${tab.value}${typeFilter !== 'all' ? `&type=${typeFilter}` : ''}`}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className={`${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                {tab.count}
              </span>
            </a>
          )
        })}
      </div>

      {/* Type filter tabs */}
      {statusFilter === 'pending' && (
        <div className="flex flex-wrap gap-2 mb-6">
          {typeTabs.map((tab) => {
            const isActive = tab.value === typeFilter
            const IconComponent = tab.icon || Bell
            return (
              <a
                key={tab.value}
                href={`/reminders?status=${statusFilter}&type=${tab.value}`}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-800/50 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                }`}
              >
                {tab.icon && <IconComponent className="w-3 h-3" />}
                {tab.label}
                {tab.count > 0 && (
                  <span className={`${isActive ? 'text-slate-400' : 'text-slate-600'}`}>
                    {tab.count}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      )}

      {/* Reminder list */}
      {error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400">Error: {error.message}</p>
        </div>
      ) : reminders && reminders.length > 0 ? (
        <ReminderList reminders={reminders} />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <Bell className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {statusFilter === 'all'
              ? 'No reminders yet'
              : typeFilter !== 'all'
              ? `No ${typeLabels[typeFilter] || typeFilter} reminders`
              : `No ${statusFilter} reminders`}
          </h3>
          <p className="text-slate-400 mb-6">
            Reminders are automatically extracted from commitments made in your meetings.
            <br />
            You can also detect stale relationships that need attention.
          </p>
          <GenerateStaleButton variant="primary" />
        </div>
      )}
    </div>
  )
}
