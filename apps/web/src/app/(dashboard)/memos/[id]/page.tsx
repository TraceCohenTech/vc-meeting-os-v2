import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  Building2,
  Clock,
  ExternalLink,
  FileText,
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
      id,
      title,
      content,
      summary,
      meeting_date,
      duration_minutes,
      tags,
      source,
      drive_file_id,
      drive_web_view_link,
      created_at,
      updated_at,
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
      drive_file_id: string | null
      drive_web_view_link: string | null
      created_at: string
      updated_at: string
      companies: { id: string; name: string; website: string | null } | null
    } | null, error: Error | null }

  if (error || !memo) {
    notFound()
  }

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

  // Format content with markdown rendering
  const formatContent = (content: string) => {
    return content
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-white mt-6 mb-3">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-medium text-white mt-4 mb-2">$1</h3>')
      .replace(/^\* (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Activity
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
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
              {memo.source && memo.source !== 'manual' && (
                <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full capitalize">
                  {memo.source}
                </span>
              )}
            </div>
          </div>

          <DeleteMemoButton memoId={id} />
        </div>
      </div>

      {/* Primary CTA: Google Docs */}
      {memo.drive_web_view_link ? (
        <a
          href={memo.drive_web_view_link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 mb-6 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-xl hover:border-blue-500/50 transition-colors"
        >
          <div className="bg-blue-500 p-3 rounded-lg">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold">Open in Google Docs</h3>
            <p className="text-slate-300 text-sm">
              Edit and share this memo in your Drive
            </p>
          </div>
          <ExternalLink className="w-5 h-5 text-blue-400" />
        </a>
      ) : (
        <div className="flex items-center gap-3 p-3 mb-6 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-slate-400">
          <FileText className="w-4 h-4" />
          <span>Connect Google Drive in Settings to enable editing in Docs</span>
          <Link href="/settings" className="text-indigo-400 hover:text-indigo-300 ml-auto">
            Settings →
          </Link>
        </div>
      )}

      {/* Company card */}
      {company && (
        <Link
          href={`/companies/${company.id}`}
          className="flex items-center gap-4 p-4 mb-6 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Company</p>
            <p className="text-white font-semibold text-lg">{company.name}</p>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-500" />
        </Link>
      )}

      {/* Summary */}
      {memo.summary && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-indigo-400 mb-2 uppercase tracking-wide">Summary</h2>
          <p className="text-slate-300 leading-relaxed">{memo.summary}</p>
        </div>
      )}

      {/* Content - Read Only */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
        <div className="prose prose-invert max-w-none">
          <div
            className="text-slate-300 leading-relaxed whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: formatContent(memo.content) }}
          />
        </div>
      </div>

      {/* Tags */}
      {memo.tags && memo.tags.length > 0 && (
        <div className="mb-6">
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wide">
            Action Items ({tasks.length})
          </h2>
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg"
              >
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
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
        </div>
      )}

      {/* Metadata footer */}
      <div className="pt-6 border-t border-slate-800 text-sm text-slate-500">
        <p>
          Generated {new Date(memo.created_at).toLocaleString()}
          {memo.updated_at !== memo.created_at && (
            <> · Updated {new Date(memo.updated_at).toLocaleString()}</>
          )}
        </p>
      </div>
    </div>
  )
}
