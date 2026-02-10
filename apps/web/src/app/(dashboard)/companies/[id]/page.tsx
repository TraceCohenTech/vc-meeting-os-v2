import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, Calendar, Globe, Pencil, FileText, CheckSquare } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

const stageLabels: Record<string, string> = {
  idea: 'Idea',
  'pre-seed': 'Pre-Seed',
  seed: 'Seed',
  'series-a': 'Series A',
  'series-b': 'Series B',
  'series-c': 'Series C',
  growth: 'Growth',
  public: 'Public',
}

const statusLabels: Record<string, string> = {
  tracking: 'Tracking',
  'actively-reviewing': 'Actively Reviewing',
  'due-diligence': 'Due Diligence',
  passed: 'Passed',
  invested: 'Invested',
  exited: 'Exited',
}

export default async function CompanyPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .eq('user_id', user!.id)
    .single() as {
    data: {
      id: string
      name: string
      industry: string | null
      status: string
      stage: string | null
      website: string | null
      notes: string | null
      created_at: string
    } | null
    error: Error | null
  }

  if (error || !company) {
    notFound()
  }

  const { data: memos } = await supabase
    .from('memos')
    .select('id, title, meeting_date')
    .eq('company_id', id)
    .eq('user_id', user!.id)
    .order('meeting_date', { ascending: false, nullsFirst: false })
    .limit(10) as {
    data: Array<{ id: string; title: string; meeting_date: string | null }> | null
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, due_date, priority')
    .eq('company_id', id)
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(10) as {
    data: Array<{
      id: string
      title: string
      status: string
      due_date: string | null
      priority: string
    }> | null
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link
        href="/companies"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Companies
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{company.name}</h1>
                {company.industry && <p className="text-slate-400">{company.industry}</p>}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {company.status && (
                <span className="px-3 py-1 bg-slate-800 text-slate-200 rounded-full text-sm">
                  {statusLabels[company.status] || company.status}
                </span>
              )}
              {company.stage && (
                <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-sm">
                  {stageLabels[company.stage] || company.stage}
                </span>
              )}
            </div>
          </div>

          <Link
            href={`/companies/${id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-sm">
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300"
            >
              <Globe className="w-4 h-4" />
              {company.website}
            </a>
          )}
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar className="w-4 h-4" />
            Added {new Date(company.created_at).toLocaleDateString()}
          </div>
        </div>

        {company.notes && (
          <div className="mt-6 p-4 bg-slate-800/60 rounded-xl">
            <h2 className="text-sm font-semibold text-slate-300 mb-2">Notes</h2>
            <p className="text-slate-300 whitespace-pre-wrap">{company.notes}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-blue-400" />
            <h2 className="text-white font-semibold">Related Memos</h2>
          </div>
          {memos && memos.length > 0 ? (
            <ul className="space-y-2">
              {memos.map((memo) => (
                <li key={memo.id}>
                  <Link
                    href={`/memos/${memo.id}`}
                    className="block p-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-200"
                  >
                    <p className="font-medium truncate">{memo.title}</p>
                    {memo.meeting_date && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(memo.meeting_date).toLocaleDateString()}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">No memos linked yet.</p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare className="w-4 h-4 text-amber-400" />
            <h2 className="text-white font-semibold">Related Tasks</h2>
          </div>
          {tasks && tasks.length > 0 ? (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="p-3 rounded-lg bg-slate-800/60">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-slate-200 truncate">{task.title}</p>
                    <span className="text-xs text-slate-500">{task.status.replace('_', ' ')}</span>
                  </div>
                  {task.due_date && (
                    <p className="text-xs text-slate-500 mt-1">
                      Due {new Date(task.due_date).toLocaleDateString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">No tasks linked yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
