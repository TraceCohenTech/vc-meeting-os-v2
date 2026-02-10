'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface EditCompanyFormProps {
  company: {
    id: string
    name: string
    website: string | null
    stage: string | null
    status: string
    industry: string | null
    notes: string | null
  }
}

const stages = [
  { value: '', label: 'Select stage...' },
  { value: 'idea', label: 'Idea' },
  { value: 'pre-seed', label: 'Pre-Seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'series-a', label: 'Series A' },
  { value: 'series-b', label: 'Series B' },
  { value: 'series-c', label: 'Series C' },
  { value: 'growth', label: 'Growth' },
  { value: 'public', label: 'Public' },
]

const statuses = [
  { value: 'tracking', label: 'Tracking' },
  { value: 'actively-reviewing', label: 'Actively Reviewing' },
  { value: 'due-diligence', label: 'Due Diligence' },
  { value: 'passed', label: 'Passed' },
  { value: 'invested', label: 'Invested' },
  { value: 'exited', label: 'Exited' },
]

export function EditCompanyForm({ company }: EditCompanyFormProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: company.name,
    website: company.website || '',
    industry: company.industry || '',
    stage: company.stage || '',
    status: company.status,
    notes: company.notes || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: updateError } = await (supabase.from('companies') as ReturnType<typeof supabase.from>)
        .update({
          name: formData.name,
          website: formData.website || null,
          industry: formData.industry || null,
          stage: formData.stage || null,
          status: formData.status,
          notes: formData.notes || null,
        } as never)
        .eq('id', company.id)

      if (updateError) {
        setError(updateError.message)
        return
      }

      router.push(`/companies/${company.id}`)
      router.refresh()
    } catch {
      setError('Failed to update company')
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
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Company Name *</label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Website</label>
        <input
          type="url"
          value={formData.website}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Stage</label>
          <select
            value={formData.stage}
            onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
          >
            {stages.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
          >
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Industry</label>
        <input
          type="text"
          value={formData.industry}
          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={5}
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white resize-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/companies/${company.id}`)}
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
