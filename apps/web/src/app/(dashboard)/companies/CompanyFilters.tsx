'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { useState, useTransition } from 'react'

const statuses = [
  { value: '', label: 'All' },
  { value: 'tracking', label: 'Tracking' },
  { value: 'actively-reviewing', label: 'Active' },
  { value: 'due-diligence', label: 'DD' },
  { value: 'passed', label: 'Passed' },
  { value: 'invested', label: 'Invested' },
  { value: 'exited', label: 'Exited' },
]

const stages = [
  { value: '', label: 'All Stages' },
  { value: 'idea', label: 'Idea' },
  { value: 'pre-seed', label: 'Pre-Seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'series-a', label: 'Series A' },
  { value: 'series-b', label: 'Series B' },
  { value: 'series-c', label: 'Series C' },
  { value: 'growth', label: 'Growth' },
]

interface CompanyFiltersProps {
  currentStatus?: string
  currentStage?: string
  currentSearch?: string
  statusCounts: Record<string, number>
}

export function CompanyFilters({
  currentStatus,
  currentStage,
  currentSearch,
  statusCounts,
}: CompanyFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(currentSearch || '')

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    startTransition(() => {
      router.push(`/companies?${params.toString()}`)
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams('search', searchValue)
  }

  const clearSearch = () => {
    setSearchValue('')
    updateParams('search', '')
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {statuses.map((status) => {
          const isActive = status.value === (currentStatus || '')
          const count = status.value ? statusCounts[status.value] || 0 : Object.values(statusCounts).reduce((a, b) => a + b, 0)
          return (
            <button
              key={status.value}
              onClick={() => updateParams('status', status.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {status.label}
              {count > 0 && (
                <span className={`ml-2 ${isActive ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Search and stage filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search companies..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {searchValue && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        <select
          value={currentStage || ''}
          onChange={(e) => updateParams('stage', e.target.value)}
          className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          {stages.map((stage) => (
            <option key={stage.value} value={stage.value}>
              {stage.label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading indicator */}
      {isPending && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <div className="w-4 h-4 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
          Loading...
        </div>
      )}
    </div>
  )
}
