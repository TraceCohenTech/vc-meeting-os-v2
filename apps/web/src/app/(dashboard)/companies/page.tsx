import { createClient } from '@/lib/supabase/server'
import { Building2 } from 'lucide-react'
import { CompanyFilters } from './CompanyFilters'
import { CompanyCard } from './CompanyCard'
import { NewCompanyButton } from './NewCompanyButton'

const stageLabels: Record<string, string> = {
  idea: 'Idea',
  'pre-seed': 'Pre-Seed',
  seed: 'Seed',
  'series-a': 'Series A',
  'series-b': 'Series B',
  'series-c': 'Series C',
  growth: 'Growth',
  public: 'Public',
}

const statusLabels: Record<string, string> = {
  tracking: 'Tracking',
  'actively-reviewing': 'Actively Reviewing',
  'due-diligence': 'Due Diligence',
  passed: 'Passed',
  invested: 'Invested',
  exited: 'Exited',
}

const statusColors: Record<string, string> = {
  tracking: 'bg-slate-500',
  'actively-reviewing': 'bg-blue-500',
  'due-diligence': 'bg-purple-500',
  passed: 'bg-slate-600',
  invested: 'bg-emerald-500',
  exited: 'bg-amber-500',
}

interface SearchParams {
  status?: string
  stage?: string
  search?: string
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Build query
  let query = supabase
    .from('companies')
    .select('*')
    .eq('user_id', user!.id)
    .order('updated_at', { ascending: false })

  if (params.status) {
    query = query.eq('status', params.status)
  }

  if (params.stage) {
    query = query.eq('stage', params.stage)
  }

  if (params.search) {
    query = query.ilike('name', `%${params.search}%`)
  }

  type CompanyResult = {
    id: string
    user_id: string
    name: string
    website: string | null
    domain: string | null
    normalized_domain: string | null
    stage: 'idea' | 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'series-c' | 'growth' | 'public' | null
    status: 'tracking' | 'actively-reviewing' | 'due-diligence' | 'passed' | 'invested' | 'exited'
    industry: string | null
    founders: Array<{ name: string; title?: string }> | null
    notes: string | null
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
  }
  const { data: companies, error } = await query as unknown as { data: CompanyResult[] | null, error: Error | null }

  // Get counts by status
  const { data: statusCounts } = await supabase
    .from('companies')
    .select('status')
    .eq('user_id', user!.id)

  const counts = statusCounts?.reduce(
    (acc, { status }) => {
      acc[status] = (acc[status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  ) || {}

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Companies</h1>
          <p className="text-slate-400 mt-1">
            Track and manage your deal pipeline
          </p>
        </div>
        <NewCompanyButton />
      </div>

      {/* Filters */}
      <CompanyFilters
        currentStatus={params.status}
        currentStage={params.stage}
        currentSearch={params.search}
        statusCounts={counts}
      />

      {/* Companies Grid */}
      {error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400">Error loading companies: {error.message}</p>
        </div>
      ) : companies && companies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company as unknown as Parameters<typeof CompanyCard>[0]['company']}
              stageLabels={stageLabels}
              statusLabels={statusLabels}
              statusColors={statusColors}
            />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No companies yet</h3>
          <p className="text-slate-400 mb-6">
            Start tracking companies you&apos;re interested in
          </p>
          <NewCompanyButton variant="primary" />
        </div>
      )}
    </div>
  )
}
