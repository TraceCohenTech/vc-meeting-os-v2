'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2, Check } from 'lucide-react'

export function SyncMemosButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ processed: number; skipped: number } | null>(null)
  const router = useRouter()

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncResult(null)

    try {
      const response = await fetch('/api/process/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (response.ok) {
        setSyncResult({ processed: data.processed || 0, skipped: data.skipped || 0 })
        router.refresh()

        // Clear success message after 3 seconds
        setTimeout(() => setSyncResult(null), 3000)
      } else {
        console.error('Sync failed:', data)
        alert(data.error || 'Failed to sync memos')
      }
    } catch (err) {
      console.error('Sync error:', err)
      alert('Failed to sync memos')
    } finally {
      setIsSyncing(false)
    }
  }

  if (syncResult) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium">
        <Check className="w-5 h-5" />
        {syncResult.processed > 0
          ? `${syncResult.processed} new memo${syncResult.processed !== 1 ? 's' : ''} imported`
          : 'All memos up to date'}
      </div>
    )
  }

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isSyncing ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <RefreshCw className="w-5 h-5" />
      )}
      {isSyncing ? 'Syncing...' : 'Sync Memos'}
    </button>
  )
}
