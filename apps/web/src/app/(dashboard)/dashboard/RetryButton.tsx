'use client'

import { useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface RetryButtonProps {
  pendingCount: number
  failedCount?: number
}

export function RetryButton({ pendingCount, failedCount = 0 }: RetryButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()

  const handleRetry = async () => {
    if (pendingCount === 0) return

    setIsProcessing(true)
    setMessage(null)

    try {
      const response = await fetch('/api/process/retry', {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`Processed ${data.processed} of ${data.total} jobs`)
        setTimeout(() => {
          router.refresh()
        }, 1500)
      } else {
        setMessage(data.error || 'Processing failed')
      }
    } catch {
      setMessage('Failed to process jobs')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('Clear all failed and stale jobs?')) return

    setIsClearing(true)
    setMessage(null)

    try {
      const response = await fetch('/api/process/clear', {
        method: 'DELETE',
      })

      const data = await response.json()

      if (response.ok) {
        const total = (data.cleared?.failed || 0) + (data.cleared?.stale || 0)
        setMessage(`Cleared ${total} jobs`)
        setTimeout(() => {
          router.refresh()
        }, 1000)
      } else {
        setMessage(data.error || 'Failed to clear')
      }
    } catch {
      setMessage('Failed to clear jobs')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span className="text-xs text-slate-300">{message}</span>
      )}
      {pendingCount > 0 && (
        <button
          onClick={handleRetry}
          disabled={isProcessing || isClearing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white text-sm rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
          {isProcessing ? 'Processing...' : 'Process Now'}
        </button>
      )}
      {(failedCount > 0 || pendingCount > 0) && (
        <button
          onClick={handleClear}
          disabled={isProcessing || isClearing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/50 text-white text-sm rounded-lg transition-colors"
        >
          <Trash2 className={`w-3.5 h-3.5 ${isClearing ? 'animate-pulse' : ''}`} />
          Clear
        </button>
      )}
    </div>
  )
}
