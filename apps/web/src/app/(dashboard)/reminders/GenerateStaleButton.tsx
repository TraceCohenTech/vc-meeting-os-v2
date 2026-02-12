'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Loader2 } from 'lucide-react'

interface GenerateStaleButtonProps {
  variant?: 'default' | 'primary'
}

export function GenerateStaleButton({ variant = 'default' }: GenerateStaleButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  const generateReminders = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/reminders/stale', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to generate reminders')
      }

      const data = await response.json()
      setResult({ created: data.created, skipped: data.skipped })

      // Refresh the page to show new reminders
      router.refresh()
    } catch (error) {
      console.error('Generate error:', error)
    }

    setIsLoading(false)
  }

  const buttonClass = variant === 'primary'
    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={generateReminders}
        disabled={isLoading}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${buttonClass}`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Users className="w-4 h-4" />
        )}
        {isLoading ? 'Scanning...' : 'Find Stale Relationships'}
      </button>

      {result && (
        <div className="text-xs text-slate-500">
          {result.created > 0 ? (
            <span className="text-emerald-400">
              Created {result.created} reminder{result.created !== 1 ? 's' : ''}
            </span>
          ) : (
            <span>No new stale relationships found</span>
          )}
        </div>
      )}
    </div>
  )
}
