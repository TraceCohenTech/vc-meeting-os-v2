'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Building2, FolderOpen, Trash2, Loader2 } from 'lucide-react'

interface MemoCardProps {
  memo: {
    id: string
    title: string
    summary: string | null
    meeting_date: string | null
    tags?: string[] | null
    folder?: { id: string; name: string; color: string } | null
    company?: { id: string; name: string } | null
  }
}

export function MemoCard({ memo }: MemoCardProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/memos/${memo.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete memo')
      }
    } catch {
      alert('Failed to delete memo')
    } finally {
      setIsDeleting(false)
      setShowConfirm(false)
    }
  }

  return (
    <div className="group relative bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
      <Link
        href={`/memos/${memo.id}`}
        className="block p-5"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-10">
            <h3 className="text-lg font-semibold text-white truncate">
              {memo.title}
            </h3>
            {memo.summary && (
              <p className="text-slate-400 text-sm mt-1 line-clamp-2">
                {memo.summary}
              </p>
            )}
          </div>
          {memo.meeting_date && (
            <div className="flex items-center gap-1.5 text-slate-500 text-sm ml-4">
              <Calendar className="w-4 h-4" />
              {new Date(memo.meeting_date).toLocaleDateString()}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          {memo.folder && (
            <div className="flex items-center gap-1.5 text-sm">
              <FolderOpen
                className="w-4 h-4"
                style={{ color: memo.folder.color }}
              />
              <span className="text-slate-400">{memo.folder.name}</span>
            </div>
          )}
          {memo.company && (
            <div className="flex items-center gap-1.5 text-sm">
              <Building2 className="w-4 h-4 text-slate-500" />
              <span className="text-slate-400">{memo.company.name}</span>
            </div>
          )}
          {memo.tags && memo.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {memo.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
              {memo.tags.length > 3 && (
                <span className="text-xs text-slate-500">
                  +{memo.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setShowConfirm(true)
        }}
        className="absolute top-4 right-4 p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-slate-800 rounded-lg"
        title="Delete memo"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Delete confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowConfirm(false)}>
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-2">Delete Memo?</h3>
            <p className="text-slate-400 text-sm mb-4">
              This will permanently delete &ldquo;{memo.title}&rdquo; and remove it from Google Drive if connected. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
