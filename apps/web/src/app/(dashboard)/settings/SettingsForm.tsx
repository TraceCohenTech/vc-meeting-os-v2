'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/lib/supabase/types'

interface SettingsFormProps {
  profile: Profile | null
  userEmail: string
}

export function SettingsForm({ profile, userEmail }: SettingsFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [formData, setFormData] = useState({
    display_name: profile?.display_name || '',
    notification_email: profile?.notification_email || userEmail,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setMessage({ type: 'error', text: 'Not authenticated' })
        return
      }

      const { error } = await (supabase.from('profiles') as ReturnType<typeof supabase.from>)
        .update({
          display_name: formData.display_name || null,
          notification_email: formData.notification_email || null,
        } as never)
        .eq('id', user.id)

      if (error) {
        setMessage({ type: 'error', text: error.message })
        return
      }

      setMessage({ type: 'success', text: 'Settings saved successfully' })
      router.refresh()
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && (
        <div
          className={`p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          }`}
        >
          <p className={`text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {message.text}
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Email
        </label>
        <input
          type="email"
          value={userEmail}
          disabled
          className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-500 cursor-not-allowed"
        />
        <p className="text-xs text-slate-500 mt-1">
          Email cannot be changed
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Display Name
        </label>
        <input
          type="text"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Your name"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          Notification Email
        </label>
        <input
          type="email"
          value={formData.notification_email}
          onChange={(e) => setFormData({ ...formData, notification_email: e.target.value })}
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="email@example.com"
        />
        <p className="text-xs text-slate-500 mt-1">
          Where to send email digests and notifications
        </p>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
