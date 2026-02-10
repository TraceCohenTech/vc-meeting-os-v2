import { createClient, createAdminClient } from '@/lib/supabase/server'
import { FileText, Building2, ExternalLink, Clock, Loader2, CheckCircle2, Settings, Zap } from 'lucide-react'
import Link from 'next/link'

interface RecentMemo {
  id: string
  title: string
  summary: string | null
  meeting_date: string | null
  source: string | null
  drive_web_view_link: string | null
  created_at: string
  companies: { name: string } | null
}

interface Integration {
  provider: string
  status: string
}

interface ProcessingJob {
  id: string
  source: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  current_step: string | null
  metadata: { title?: string } | null
  created_at: string
}

export default async function ActivityPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch recent memos (the main activity feed)
  const { data: recentMemos } = await supabase
    .from('memos')
    .select('id, title, summary, meeting_date, source, drive_web_view_link, created_at, companies(name)')
    .order('created_at', { ascending: false })
    .limit(20) as { data: RecentMemo[] | null }

  // Fetch user's integrations status
  const { data: integrations } = await (adminClient
    .from('integrations') as ReturnType<typeof adminClient.from>)
    .select('provider, status')
    .eq('user_id', user!.id)
    .eq('status', 'active') as { data: Integration[] | null }

  const hasFireflies = integrations?.some(i => i.provider === 'fireflies')
  const hasGoogle = integrations?.some(i => i.provider === 'google')

  // Fetch active processing jobs
  const { data: processingJobs } = await supabase
    .from('processing_jobs')
    .select('id, source, status, current_step, metadata, created_at')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(5) as { data: ProcessingJob[] | null }

  // Quick stats
  const { count: memoCount } = await supabase
    .from('memos')
    .select('*', { count: 'exact', head: true })

  const { count: companyCount } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Activity</h1>
        <p className="text-slate-400 mt-1">
          Your meeting memos appear here automatically
        </p>
      </div>

      {/* Integration Status Banner */}
      {!hasFireflies && (
        <Link
          href="/settings"
          className="block mb-6 bg-gradient-to-r from-amber-600/20 to-orange-600/20 border border-amber-500/30 rounded-xl p-4 hover:border-amber-500/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/20 p-2 rounded-lg">
              <Settings className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">Connect Fireflies to get started</h3>
              <p className="text-slate-300 text-sm">
                Once connected, your meeting memos will be generated automatically
              </p>
            </div>
            <span className="text-amber-400 text-sm font-medium">Set up →</span>
          </div>
        </Link>
      )}

      {/* Processing Status */}
      {processingJobs && processingJobs.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-indigo-600/20 to-cyan-600/20 border border-indigo-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500 p-2 rounded-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold">Processing Meetings</h3>
              <div className="space-y-1 mt-1">
                {processingJobs.map((job) => (
                  <div key={job.id} className="flex items-center gap-2 text-sm">
                    <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                    <span className="text-slate-300">
                      {job.metadata?.title || `Meeting from ${job.source}`}
                    </span>
                    {job.current_step && (
                      <span className="text-indigo-400">• {job.current_step}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link
          href="/memos"
          className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/20 p-2 rounded-lg">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{memoCount || 0}</p>
              <p className="text-slate-400 text-sm">Memos</p>
            </div>
          </div>
        </Link>
        <Link
          href="/companies"
          className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 p-2 rounded-lg">
              <Building2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{companyCount || 0}</p>
              <p className="text-slate-400 text-sm">Companies</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Activity Feed */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Recent Memos</h2>

        {recentMemos && recentMemos.length > 0 ? (
          <div className="space-y-2">
            {recentMemos.map((memo) => (
              <div
                key={memo.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-white truncate">{memo.title}</h3>
                      {memo.source && (
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full capitalize">
                          {memo.source}
                        </span>
                      )}
                    </div>
                    {memo.companies && (
                      <p className="text-sm text-emerald-400 mb-1">
                        {(memo.companies as { name: string }).name}
                      </p>
                    )}
                    {memo.summary && (
                      <p className="text-sm text-slate-400 line-clamp-2">{memo.summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(memo.meeting_date || memo.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {memo.drive_web_view_link && (
                      <a
                        href={memo.drive_web_view_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                        title="Open in Google Docs"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    <Link
                      href={`/memos/${memo.id}`}
                      className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors"
                    >
                      View
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : hasFireflies ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <div className="bg-emerald-500/20 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-white font-medium mb-2">You&apos;re all set up!</h3>
            <p className="text-slate-400 text-sm">
              Your meeting memos will appear here automatically after your next Fireflies recording.
            </p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <div className="bg-slate-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-white font-medium mb-2">No memos yet</h3>
            <p className="text-slate-400 text-sm mb-4">
              Connect Fireflies to start generating meeting memos automatically.
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Connect Integrations
            </Link>
          </div>
        )}

        {recentMemos && recentMemos.length >= 20 && (
          <Link
            href="/memos"
            className="block text-center text-indigo-400 hover:text-indigo-300 text-sm py-3"
          >
            View all memos →
          </Link>
        )}
      </div>

      {/* Google Drive Status */}
      {hasFireflies && !hasGoogle && (
        <div className="mt-6 p-4 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📁</span>
            <div className="flex-1">
              <p className="text-white font-medium">Tip: Connect Google Drive</p>
              <p className="text-slate-400 text-sm">
                Automatically save memos to your Drive for easy editing and sharing.
              </p>
            </div>
            <Link
              href="/settings"
              className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
            >
              Connect
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
