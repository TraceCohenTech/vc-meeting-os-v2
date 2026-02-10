'use client'

import Link from 'next/link'
import { ExternalLink, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { Company } from '@/lib/supabase/types'

interface CompanyCardProps {
  company: Company
  stageLabels: Record<string, string>
  statusLabels: Record<string, string>
  statusColors: Record<string, string>
}

export function CompanyCard({
  company,
  stageLabels,
  statusLabels,
  statusColors,
}: CompanyCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const founders = company.founders as Array<{ name: string; title?: string }> | null

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <Link href={`/companies/${company.id}`} className="flex-1">
          <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">
            {company.name}
          </h3>
          {company.industry && (
            <p className="text-sm text-slate-500">{company.industry}</p>
          )}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 py-1">
              <Link
                href={`/companies/${company.id}/edit`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
              <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-slate-700">
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span
          className={`${statusColors[company.status]} px-2.5 py-1 rounded-full text-xs font-medium text-white`}
        >
          {statusLabels[company.status]}
        </span>
        {company.stage && (
          <span className="bg-slate-700 px-2.5 py-1 rounded-full text-xs font-medium text-slate-300">
            {stageLabels[company.stage]}
          </span>
        )}
      </div>

      {founders && founders.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-1">Founders</p>
          <p className="text-sm text-slate-300">
            {founders.map((f) => f.name).join(', ')}
          </p>
        </div>
      )}

      {company.website && (
        <a
          href={company.website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {company.domain || 'Website'}
        </a>
      )}

      <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500">
        Updated {new Date(company.updated_at).toLocaleDateString()}
      </div>
    </div>
  )
}
