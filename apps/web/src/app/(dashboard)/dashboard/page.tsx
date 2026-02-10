import { createClient } from '@/lib/supabase/server'
import { FileText, Building2, CheckSquare, AlertCircle, TrendingUp, Clock, Zap, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { RetryButton } from './RetryButton'
import { ClearAllButton } from './ClearAllButton'

interface Stats {
  total_memos: number
  total_companies: number
  total_tasks: number
  pending_tasks: number
  overdue_tasks: number
  active_deals: number
  memos_this_week: number
}

interface AttentionTask {
  id: string
  title: string
  due_date: string | null
  priority: string
  is_overdue: boolean
  company_id: string | null
}

interface ProcessingJob {
  id: string
  source: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  current_step: string | null
  progress: number
  result: { memo_id?: string; company_name?: string } | null
  error: string | null
  metadata: { title?: string } | null
  created_at: string
  updated_at: string
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch user stats
  // @ts-expect-error - Supabase RPC types
  const { data: stats } = await supabase.rpc('get_user_stats', {
    p_user_id: user!.id,
  }) as { data: Stats | null }

  // Fetch attention tasks
  // @ts-expect-error - Supabase RPC types
  const { data: attentionTasks } = await supabase.rpc('get_attention_tasks', {
    p_user_id: user!.id,
    hours_ahead: 48,
  }) as { data: AttentionTask[] | null }

  // Fetch recent memos
  const { data: recentMemos } = await supabase
    .from('memos')
    .select('id, title, meeting_date, company_id, companies(name)')
    .order('created_at', { ascending: false })
    .limit(5) as { data: Array<{
      id: string
      title: string
      meeting_date: string | null
      company_id: string | null
      companies: { name: string } | null
    }> | null }

  // Fetch processing jobs (incoming memos from webhooks only)
  const { data: processingJobs } = await supabase
    .from('processing_jobs')
    .select('id, source, status, current_step, progress, result, error, metadata, created_at, updated_at')
    .in('status', ['pending', 'processing', 'completed', 'failed'])
    .order('created_at', { ascending: false })
    .limit(10) as { data: ProcessingJob[] | null }

  // Filter to show recent jobs (last 24 hours for completed/failed, all pending/processing)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const incomingJobs = (processingJobs || []).filter(job => {
    if (job.status === 'pending' || job.status === 'processing') return true
    return job.updated_at > dayAgo
  })

  const hasActiveJobs = incomingJobs.some(job => job.status === 'pending' || job.status === 'processing')

  const statCards = [
    {
      label: 'Total Memos',
      value: stats?.total_memos || 0,
      icon: FileText,
      color: 'bg-blue-500',
      href: '/memos',
    },
    {
      label: 'Companies',
      value: stats?.total_companies || 0,
      icon: Building2,
      color: 'bg-emerald-500',
      href: '/companies',
    },
    {
      label: 'Active Deals',
      value: stats?.active_deals || 0,
      icon: TrendingUp,
      color: 'bg-purple-500',
      href: '/companies?status=actively-reviewing',
    },
    {
      label: 'Pending Tasks',
      value: stats?.pending_tasks || 0,
      icon: CheckSquare,
      color: 'bg-amber-500',
      href: '/tasks',
    },
  ]

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">
          Welcome back! Here&apos;s what&apos;s happening with your deals.
        </p>
      </div>

      {/* Active Processing Banner - Only show when actively processing */}
      {hasActiveJobs && (
        <div className="mb-6 bg-gradient-to-r from-indigo-600/20 to-cyan-600/20 border border-indigo-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500 p-2 rounded-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">Processing Incoming Meetings</h3>
              <p className="text-slate-300 text-sm">
                {incomingJobs.filter(j => j.status === 'processing').length > 0
                  ? `${incomingJobs.filter(j => j.status === 'processing').length} meeting(s) being analyzed...`
                  : `${incomingJobs.filter(j => j.status === 'pending').length} meeting(s) queued from webhooks`}
              </p>
            </div>
            <RetryButton
              pendingCount={incomingJobs.filter(j => j.status === 'pending').length}
              failedCount={incomingJobs.filter(j => j.status === 'failed').length}
            />
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">{stat.label}</p>
                <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Attention */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-white">Needs Attention</h2>
          </div>

          {attentionTasks && attentionTasks.length > 0 ? (
            <ul className="space-y-3">
              {attentionTasks.slice(0, 5).map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/tasks?id=${task.id}`}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          task.is_overdue
                            ? 'bg-red-500'
                            : task.priority === 'high'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`}
                      />
                      <span className="text-slate-200">{task.title}</span>
                    </div>
                    {task.due_date && (
                      <span
                        className={`text-xs ${
                          task.is_overdue ? 'text-red-400' : 'text-slate-500'
                        }`}
                      >
                        {task.is_overdue ? 'Overdue' : 'Due soon'}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 text-center py-8">
              No urgent tasks. You&apos;re all caught up!
            </p>
          )}

          {attentionTasks && attentionTasks.length > 5 && (
            <Link
              href="/tasks"
              className="block text-center text-indigo-400 hover:text-indigo-300 text-sm mt-4"
            >
              View all {attentionTasks.length} tasks
            </Link>
          )}
        </div>

        {/* Recent Memos */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-white">Recent Memos</h2>
          </div>

          {recentMemos && recentMemos.length > 0 ? (
            <ul className="space-y-3">
              {recentMemos.map((memo) => (
                <li key={memo.id}>
                  <Link
                    href={`/memos/${memo.id}`}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <div>
                      <p className="text-slate-200 font-medium">{memo.title}</p>
                      {memo.companies && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {(memo.companies as { name: string }).name}
                        </p>
                      )}
                    </div>
                    {memo.meeting_date && (
                      <span className="text-xs text-slate-500">
                        {new Date(memo.meeting_date).toLocaleDateString()}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-500 mb-3">No memos yet</p>
              <Link
                href="/memos/new"
                className="text-indigo-400 hover:text-indigo-300 text-sm"
              >
                Create your first memo
              </Link>
            </div>
          )}

          {recentMemos && recentMemos.length > 0 && (
            <Link
              href="/memos"
              className="block text-center text-indigo-400 hover:text-indigo-300 text-sm mt-4"
            >
              View all memos
            </Link>
          )}
        </div>
      </div>

      {/* Webhook Jobs Section - Collapsed by default, only show when there are jobs */}
      {incomingJobs.length > 0 && (
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-500" />
              <h2 className="text-lg font-semibold text-white">Webhook Jobs</h2>
              <span className="text-xs text-slate-500 ml-2">From connected integrations</span>
            </div>
            <ClearAllButton hasJobs={incomingJobs.length > 0} />
          </div>

          <div className="space-y-2">
            {incomingJobs.map((job) => (
              <div
                key={job.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  job.status === 'failed'
                    ? 'bg-red-500/10 border border-red-500/20'
                    : job.status === 'completed'
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : 'bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {job.status === 'pending' && (
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  {job.status === 'processing' && (
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    </div>
                  )}
                  {job.status === 'completed' && (
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                  )}
                  {job.status === 'failed' && (
                    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                      <XCircle className="w-4 h-4 text-red-400" />
                    </div>
                  )}
                  <div>
                    <p className="text-slate-200 font-medium">
                      {job.metadata?.title || `Meeting from ${job.source}`}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500 capitalize">{job.source}</span>
                      {job.status === 'processing' && job.current_step && (
                        <>
                          <span className="text-xs text-slate-600">-</span>
                          <span className="text-xs text-indigo-400 capitalize">{job.current_step}</span>
                        </>
                      )}
                      {job.status === 'completed' && job.result?.company_name && (
                        <>
                          <span className="text-xs text-slate-600">-</span>
                          <span className="text-xs text-emerald-400">{job.result.company_name}</span>
                        </>
                      )}
                      {job.status === 'failed' && job.error && (
                        <>
                          <span className="text-xs text-slate-600">-</span>
                          <span className="text-xs text-red-400 truncate max-w-[200px]">{job.error}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {job.status === 'processing' && (
                    <div className="w-24 bg-slate-700 rounded-full h-1.5">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  )}
                  {job.status === 'completed' && job.result?.memo_id && (
                    <Link
                      href={`/memos/${job.result.memo_id}`}
                      className="text-sm text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      View Memo
                    </Link>
                  )}
                  <span className="text-xs text-slate-500">
                    {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Summary */}
      {stats && stats.memos_this_week > 0 && (
        <div className="mt-6 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-2">This Week</h3>
          <p className="text-slate-300">
            You&apos;ve processed <span className="text-indigo-400 font-semibold">{stats.memos_this_week}</span> meeting{stats.memos_this_week !== 1 ? 's' : ''} this week.
            {stats.overdue_tasks > 0 && (
              <span className="text-amber-400">
                {' '}You have {stats.overdue_tasks} overdue task{stats.overdue_tasks !== 1 ? 's' : ''}.
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
