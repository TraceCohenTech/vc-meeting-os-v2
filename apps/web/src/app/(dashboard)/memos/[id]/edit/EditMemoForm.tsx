'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface EditMemoFormProps {
  memo: {
    id: string
    title: string
    content: string
    summary: string | null
    meeting_date: string | null
  }
}

export function EditMemoForm({ memo }: EditMemoFormProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(memo.title)
  const [content, setContent] = useState(memo.content)
  const [summary, setSummary] = useState(memo.summary || '')
  const [meetingDate, setMeetingDate] = useState(
    memo.meeting_date ? memo.meeting_date.slice(0, 10) : ''
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: updateError } = await (supabase.from('memos') as ReturnType<typeof supabase.from>)
        .update({
          title,
          content,
          summary: summary || null,
          meeting_date: meetingDate || null,
        } as never)
        .eq('id', memo.id)

      if (updateError) {
        setError(updateError.message)
        return
      }

      router.push(`/memos/${memo.id}`)
      router.refresh()
    } catch {
      setError('Failed to update memo')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Title *</label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Meeting Date</label>
        <input
          type="date"
          value={meetingDate}
          onChange={(e) => setMeetingDate(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Summary</label>
        <textarea
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Content *</label>
        <textarea
          rows={16}
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white resize-none font-mono text-sm"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/memos/${memo.id}`)}
          className="px-4 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
