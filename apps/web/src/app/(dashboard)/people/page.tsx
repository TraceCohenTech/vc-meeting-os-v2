import { createClient } from '@/lib/supabase/server'
import { Users, Sparkles } from 'lucide-react'
import { PersonCard } from './PersonCard'
import { NewContactButton } from './NewContactButton'
import { PeopleFilters } from './PeopleFilters'
import { SyncContactsButton } from './SyncContactsButton'

interface SearchParams {
  company?: string
  search?: string
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Build query
  let query = supabase
    .from('contacts')
    .select(`
      *,
      companies(id, name)
    `)
    .eq('user_id', user!.id)
    .order('last_met_date', { ascending: false, nullsFirst: false })

  if (params.company) {
    query = query.eq('company_id', params.company)
  }

  if (params.search) {
    query = query.or(`name.ilike.%${params.search}%,email.ilike.%${params.search}%`)
  }

  type ContactResult = {
    id: string
    user_id: string
    name: string
    email: string | null
    title: string | null
    phone: string | null
    linkedin_url: string | null
    company_id: string | null
    notes: string | null
    last_met_date: string | null
    met_via: string | null
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
    companies: { id: string; name: string } | null
  }
  const { data: contacts, error } = await query as unknown as { data: ContactResult[] | null, error: Error | null }

  // Get companies for filter dropdown
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('user_id', user!.id)
    .order('name') as { data: Array<{ id: string; name: string }> | null }

  // Get meeting counts for each contact
  const contactIds = (contacts || []).map(c => c.id)
  let meetingCounts: Record<string, number> = {}

  if (contactIds.length > 0) {
    const { data: counts } = await supabase
      .from('contact_memos')
      .select('contact_id')
      .in('contact_id', contactIds) as { data: Array<{ contact_id: string }> | null }

    meetingCounts = (counts || []).reduce((acc, { contact_id }) => {
      acc[contact_id] = (acc[contact_id] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">People</h1>
          <p className="text-slate-400 mt-1">
            Your personal CRM - track everyone you meet with
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SyncContactsButton />
          <NewContactButton companies={companies || []} />
        </div>
      </div>

      {/* Filters */}
      <PeopleFilters
        currentCompany={params.company}
        currentSearch={params.search}
        companies={companies || []}
      />

      {/* Contacts Grid */}
      {error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400">Error loading contacts: {error.message}</p>
        </div>
      ) : contacts && contacts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <PersonCard
              key={contact.id}
              contact={contact}
              meetingCount={meetingCounts[contact.id] || 0}
            />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No contacts yet</h3>
          <p className="text-slate-400 mb-4 max-w-md mx-auto">
            Contacts are automatically extracted from your meeting memos, or you can add them manually.
          </p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-sm text-slate-500">Have existing memos? Click &ldquo;Sync from Memos&rdquo; above</span>
          </div>
          <NewContactButton variant="primary" companies={companies || []} />
        </div>
      )}
    </div>
  )
}
