'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, FolderOpen, Building2 } from 'lucide-react'
import { useState, useTransition } from 'react'

interface MemoSearchProps {
  folders: Array<{ id: string; name: string; color: string }>
  companies: Array<{ id: string; name: string }>
  currentQuery?: string
  currentFolder?: string
  currentCompany?: string
}

export function MemoSearch({
  folders,
  companies,
  currentQuery,
  currentFolder,
  currentCompany,
}: MemoSearchProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(currentQuery || '')

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    })
    startTransition(() => {
      router.push(`/memos?${params.toString()}`)
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ q: searchValue, folder: '', company: '' })
  }

  const clearSearch = () => {
    setSearchValue('')
    updateParams({ q: '' })
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type="text"
          placeholder="Search memos (uses full-text search)..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="w-full pl-12 pr-12 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {searchValue && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </form>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Folder filter */}
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-slate-500" />
          <select
            value={currentFolder || ''}
            onChange={(e) => updateParams({ folder: e.target.value, q: '' })}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Folders</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>

        {/* Company filter */}
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          <select
            value={currentCompany || ''}
            onChange={(e) => updateParams({ company: e.target.value, q: '' })}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {/* Active filters indicator */}
        {(currentQuery || currentFolder || currentCompany) && (
          <button
            onClick={() => {
              setSearchValue('')
              router.push('/memos')
            }}
            className="px-3 py-2 text-sm text-slate-400 hover:text-white"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Loading indicator */}
      {isPending && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <div className="w-4 h-4 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
          Searching...
        </div>
      )}
    </div>
  )
}
