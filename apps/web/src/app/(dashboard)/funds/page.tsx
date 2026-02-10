'use client'

import { useMemo, useState } from 'react'
import funds from '@/data/funds.json'
import { Search, BarChart3, MapPin, Calendar, DollarSign, Filter } from 'lucide-react'

interface FundRow {
  index: string | null
  fundName: string
  amountUsdM: number | null
  amountRaw: string | null
  dateAnnounced: string | null
  yearRaised: number | null
  fundNumber: string | null
  location: string | null
  notes: string | null
}

const allFunds = funds as FundRow[]

function bucketYears(rows: FundRow[]) {
  const counts = new Map<number, number>()
  rows.forEach((row) => {
    if (!row.yearRaised) return
    counts.set(row.yearRaised, (counts.get(row.yearRaised) || 0) + 1)
  })
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year, count }))
}

function topLocations(rows: FundRow[], limit = 6) {
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    if (!row.location) return
    const normalized = row.location.split(',')[0].trim()
    if (!normalized) return
    counts.set(normalized, (counts.get(normalized) || 0) + 1)
  })
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([location, count]) => ({ location, count }))
}

function formatAmount(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—'
  return `$${value.toFixed(0)}M`
}

export default function FundsDashboardPage() {
  const [query, setQuery] = useState('')
  const [year, setYear] = useState<string>('all')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const min = minAmount ? Number.parseFloat(minAmount) : null
    const max = maxAmount ? Number.parseFloat(maxAmount) : null

    return allFunds.filter((row) => {
      if (q) {
        const haystack = `${row.fundName} ${row.location || ''} ${row.notes || ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (year !== 'all' && row.yearRaised !== Number.parseInt(year, 10)) return false
      if (min !== null && (row.amountUsdM === null || row.amountUsdM < min)) return false
      if (max !== null && (row.amountUsdM === null || row.amountUsdM > max)) return false
      return true
    })
  }, [query, year, minAmount, maxAmount])

  const yearBuckets = useMemo(() => bucketYears(filtered), [filtered])
  const locationBuckets = useMemo(() => topLocations(filtered), [filtered])
  const totalCount = filtered.length
  const totalAmount = filtered.reduce((sum, row) => sum + (row.amountUsdM || 0), 0)
  const avgAmount = totalCount ? totalAmount / totalCount : 0

  const maxYearCount = Math.max(1, ...yearBuckets.map((b) => b.count))

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Fundraising Tracker</h1>
          <p className="text-slate-400">Explore VC funds under $200M, searchable and filterable.</p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-slate-400">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          Updated from CSV dataset
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Funds</div>
          <div className="text-2xl font-semibold text-white mt-1">{totalCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Capital</div>
          <div className="text-2xl font-semibold text-white mt-1">${totalAmount.toFixed(0)}M</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500">Average Fund Size</div>
          <div className="text-2xl font-semibold text-white mt-1">${avgAmount.toFixed(1)}M</div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Filter className="w-4 h-4 text-indigo-400" />
          Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search fund, location, notes"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100"
            />
          </div>
          <div>
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100"
            >
              <option value="all">All Years</option>
              {Array.from(new Set(allFunds.map((row) => row.yearRaised).filter(Boolean)))
                .sort((a, b) => (a || 0) - (b || 0))
                .map((yr) => (
                  <option key={yr} value={yr || ''}>
                    {yr}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <input
              value={minAmount}
              onChange={(event) => setMinAmount(event.target.value)}
              placeholder="Min $M"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100"
            />
          </div>
          <div>
            <input
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value)}
              placeholder="Max $M"
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-slate-300 mb-4">
            <Calendar className="w-4 h-4 text-indigo-400" />
            Funds by Year
          </div>
          <div className="space-y-2">
            {yearBuckets.map((bucket) => (
              <div key={bucket.year} className="flex items-center gap-3">
                <div className="w-12 text-xs text-slate-400">{bucket.year}</div>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${(bucket.count / maxYearCount) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400">{bucket.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-sm text-slate-300 mb-4">
            <MapPin className="w-4 h-4 text-indigo-400" />
            Top Locations
          </div>
          <div className="space-y-3">
            {locationBuckets.map((bucket) => (
              <div key={bucket.location} className="flex items-center justify-between">
                <div className="text-sm text-slate-200">{bucket.location}</div>
                <div className="text-sm text-slate-400">{bucket.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm text-slate-300 mb-4">
          <DollarSign className="w-4 h-4 text-indigo-400" />
          Funds ({filtered.length})
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-200">
            <thead className="text-xs text-slate-500">
              <tr className="text-left">
                <th className="py-2 pr-4">Fund</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Year</th>
                <th className="py-2 pr-4">Location</th>
                <th className="py-2 pr-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((row) => (
                <tr key={`${row.fundName}-${row.index}`} className="border-t border-slate-800">
                  <td className="py-3 pr-4 font-medium text-slate-100">{row.fundName}</td>
                  <td className="py-3 pr-4">{formatAmount(row.amountUsdM) || row.amountRaw}</td>
                  <td className="py-3 pr-4">{row.yearRaised || '—'}</td>
                  <td className="py-3 pr-4">{row.location || '—'}</td>
                  <td className="py-3 pr-4">
                    {row.notes ? (
                      <a
                        href={row.notes}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-300 hover:text-indigo-200"
                      >
                        Source
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <p className="text-xs text-slate-500 mt-3">
              Showing first 200 results. Narrow your filters to see more.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
