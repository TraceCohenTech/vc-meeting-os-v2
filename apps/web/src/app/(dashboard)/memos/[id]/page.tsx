import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Building2,
  FolderOpen,
  Clock,
  Edit,
  ExternalLink,
} from 'lucide-react'
import { DeleteMemoButton } from './DeleteMemoButton'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MemoPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: memo, error } = await supabase
    .from('memos')
    .select(`
      *,
      folders(id, name, color),
      companies(id, name, website)
    `)
    .eq('id', id)
    .eq('user_id', user!.id)
    .single() as { data: {
      id: string
      title: string
      content: string
      summary: string | null
      meeting_date: string | null
      duration_minutes: number | null
      tags: string[] | null
      source: string
      created_at: string
      updated_at: string
      folders: { id: string; name: string; color: string } | null
      companies: { id: string; name: string; website: string | null } | null
    } | null, error: Error | null }

  if (error || !memo) {
    notFound()
  }

  const folder = memo.folders
  const company = memo.companies

  // Fetch related tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('memo_id', id)
    .order('created_at') as { data: Array<{
      id: string
      title: string
      status: string
      priority: string
      due_date: string | null
    }> | null }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/memos"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Memos
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">{memo.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
              {memo.meeting_date && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {new Date(memo.meeting_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
              )}
              {memo.duration_minutes && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {memo.duration_minutes} min
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/memos/${id}/edit`}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
            >
              <Edit className="w-5 h-5" />
            </Link>
            <DeleteMemoButton memoId={id} />
          </div>
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {folder && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${folder.color}20` }}
              >
                <FolderOpen className="w-5 h-5" style={{ color: folder.color }} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Folder</p>
                <p className="text-white font-medium">{folder.name}</p>
              </div>
            </div>
          </div>
        )}

        {company && (
          <Link
            href={`/companies/${company.id}`}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500">Company</p>
                <p className="text-white font-medium">{company.name}</p>
              </div>
              {company.website && (
                <ExternalLink className="w-4 h-4 text-slate-500" />
              )}
            </div>
          </Link>
        )}
      </div>

      {/* Summary */}
      {memo.summary && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-6 mb-8">
          <h2 className="text-sm font-medium text-indigo-400 mb-2">Summary</h2>
          <p className="text-slate-300">{memo.summary}</p>
        </div>
      )}

      {/* Content */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
        <div className="prose prose-invert max-w-none">
          <div className="whitespace-pre-wrap text-slate-300 leading-relaxed">
            {memo.content}
          </div>
        </div>
      </div>

      {/* Tags */}
      {memo.tags && memo.tags.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-slate-400 mb-2">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {memo.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-slate-800 text-slate-300 text-sm rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      {tasks && tasks.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Action Items ({tasks.length})
          </h2>
          <ul className="space-y-3">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    task.status === 'completed'
                      ? 'bg-emerald-500'
                      : task.priority === 'high'
                      ? 'bg-red-500'
                      : task.priority === 'medium'
                      ? 'bg-amber-500'
                      : 'bg-slate-500'
                  }`}
                />
                <span
                  className={`flex-1 ${
                    task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-300'
                  }`}
                >
                  {task.title}
                </span>
                {task.due_date && (
                  <span className="text-xs text-slate-500">
                    {new Date(task.due_date).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Link
            href="/tasks"
            className="block text-center text-indigo-400 hover:text-indigo-300 text-sm mt-4"
          >
            View all tasks
          </Link>
        </div>
      )}

      {/* Metadata footer */}
      <div className="mt-8 pt-6 border-t border-slate-800 text-sm text-slate-500">
        <p>
          Created {new Date(memo.created_at).toLocaleString()} · Last updated{' '}
          {new Date(memo.updated_at).toLocaleString()}
        </p>
        {memo.source !== 'manual' && (
          <p className="mt-1">Source: {memo.source}</p>
        )}
      </div>
    </div>
  )
}
