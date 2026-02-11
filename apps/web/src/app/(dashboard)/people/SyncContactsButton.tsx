'use client'

import { useState } from 'react'
import { RefreshCw, Check, AlertCircle } from 'lucide-react'

export function SyncContactsButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSync = async () => {
    setSyncing(true)
    setResult(null)

    try {
      const response = await fetch('/api/contacts/backfill', { method: 'POST' })
      const data = await response.json()

      if (response.ok) {
        setResult({
          success: true,
          message: `Synced ${data.new_contacts || 0} new contacts from ${data.processed_memos || 0} memos`,
        })
        // Refresh the page after a short delay to show new contacts
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to sync contacts',
        })
      }
    } catch {
      setResult({
        success: false,
        message: 'Network error - please try again',
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span
          className={`text-sm flex items-center gap-1.5 ${
            result.success ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {result.success ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {result.message}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing...' : 'Sync from Memos'}
      </button>
    </div>
  )
}
