'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ClearAllButtonProps {
  hasJobs: boolean
}

export function ClearAllButton({ hasJobs }: ClearAllButtonProps) {
  const [isClearing, setIsClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const router = useRouter()

  const handleClear = async () => {
    setIsClearing(true)

    try {
      const response = await fetch('/api/process/clear', {
        method: 'DELETE',
      })

      if (response.ok) {
        router.refresh()
      }
    } catch {
      // Silent fail
    } finally {
      setIsClearing(false)
      setShowConfirm(false)
    }
  }

  if (!hasJobs) return null

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-red-400 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Clear All
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowConfirm(false)}>
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-2">Clear All Jobs?</h3>
            <p className="text-slate-400 text-sm mb-4">
              This will remove all completed and failed jobs from the list. Active jobs will continue processing.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isClearing}
                className="flex-1 px-4 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={isClearing}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isClearing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Clear All'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
