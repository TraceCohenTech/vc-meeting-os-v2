import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Calendar,
  Linkedin,
  ExternalLink,
  FileText,
  MessageSquare,
  Target,
  AlertCircle,
  Lightbulb,
  CheckSquare,
  Users,
  TrendingUp,
} from 'lucide-react'
import { DeleteContactButton } from './DeleteContactButton'
import { EditContactButton } from './EditContactButton'

interface PageProps {
  params: Promise<{ id: string }>
}

interface MeetingContext {
  their_interests?: string[]
  their_concerns?: string[]
  their_asks?: string[]
  key_quotes?: string[]
  follow_up_items?: string[]
  discussion_topics?: string[]
  sentiment?: string
  engagement_level?: string
  meeting_date?: string
}

const relationshipLabels: Record<string, { label: string; color: string }> = {
  founder: { label: 'Founder', color: 'bg-purple-500/20 text-purple-400' },
  investor: { label: 'Investor', color: 'bg-emerald-500/20 text-emerald-400' },
  advisor: { label: 'Advisor', color: 'bg-blue-500/20 text-blue-400' },
  executive: { label: 'Executive', color: 'bg-amber-500/20 text-amber-400' },
  operator: { label: 'Operator', color: 'bg-cyan-500/20 text-cyan-400' },
  other: { label: 'Contact', color: 'bg-slate-500/20 text-slate-400' },
}

const sentimentLabels: Record<string, { label: string; color: string }> = {
  very_positive: { label: 'Very Positive', color: 'text-emerald-400' },
  positive: { label: 'Positive', color: 'text-green-400' },
  neutral: { label: 'Neutral', color: 'text-slate-400' },
  skeptical: { label: 'Skeptical', color: 'text-amber-400' },
  negative: { label: 'Negative', color: 'text-red-400' },
}

export default async function ContactPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: contact, error } = await supabase
    .from('contacts')
    .select(`
      *,
      companies(id, name, website)
    `)
    .eq('id', id)
    .eq('user_id', user!.id)
    .single() as { data: {
      id: string
      name: string
      email: string | null
      title: string | null
      phone: string | null
      linkedin_url: string | null
      company_id: string | null
      notes: string | null
      last_met_date: string | null
      first_met_date: string | null
      meeting_count: number | null
      relationship_type: string | null
      met_via: string | null
      metadata: Record<string, unknown>
      created_at: string
      updated_at: string
      companies: { id: string; name: string; website: string | null } | null
    } | null, error: Error | null }

  if (error || !contact) {
    notFound()
  }

  // Get related memos WITH context
  const { data: contactMemos } = await supabase
    .from('contact_memos')
    .select('memo_id, context, created_at')
    .eq('contact_id', id) as { data: Array<{ memo_id: string; context: MeetingContext | null; created_at: string }> | null }

  const memoIds = (contactMemos || []).map(cm => cm.memo_id)
  const contextByMemo = new Map(
    (contactMemos || []).map(cm => [cm.memo_id, cm.context])
  )

  let relatedMemos: Array<{
    id: string
    title: string
    meeting_date: string | null
    summary: string | null
    context: MeetingContext | null
  }> = []

  if (memoIds.length > 0) {
    const { data: memos } = await supabase
      .from('memos')
      .select('id, title, meeting_date, summary')
      .in('id', memoIds)
      .order('meeting_date', { ascending: false }) as { data: Array<{
        id: string
        title: string
        meeting_date: string | null
        summary: string | null
      }> | null }

    relatedMemos = (memos || []).map(m => ({
      ...m,
      context: contextByMemo.get(m.id) || null,
    }))
  }

  // Get all companies for edit modal
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('user_id', user!.id)
    .order('name') as { data: Array<{ id: string; name: string }> | null }

  const initials = contact.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  // Aggregate insights from all meetings
  const allInterests = new Set<string>()
  const allConcerns = new Set<string>()
  const allAsks = new Set<string>()
  const allQuotes: string[] = []

  relatedMemos.forEach(m => {
    if (m.context) {
      m.context.their_interests?.forEach(i => allInterests.add(i))
      m.context.their_concerns?.forEach(c => allConcerns.add(c))
      m.context.their_asks?.forEach(a => allAsks.add(a))
      m.context.key_quotes?.forEach(q => allQuotes.push(q))
    }
  })

  const relationship = contact.relationship_type
    ? relationshipLabels[contact.relationship_type] || relationshipLabels.other
    : null

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/people"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to People
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center">
              <span className="text-white text-xl font-semibold">{initials}</span>
            </div>

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">{contact.name}</h1>
                {relationship && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${relationship.color}`}>
                    {relationship.label}
                  </span>
                )}
              </div>
              {contact.title && (
                <p className="text-slate-400 mt-1">{contact.title}</p>
              )}
              {contact.companies && (
                <Link
                  href={`/companies/${contact.companies.id}`}
                  className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 mt-1"
                >
                  <Building2 className="w-4 h-4" />
                  {contact.companies.name}
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <EditContactButton contact={contact} companies={companies || []} />
            <DeleteContactButton contactId={id} />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 mt-4 text-sm">
          {contact.meeting_count !== null && contact.meeting_count > 0 && (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Users className="w-4 h-4" />
              <span>{contact.meeting_count} meeting{contact.meeting_count !== 1 ? 's' : ''}</span>
            </div>
          )}
          {contact.first_met_date && (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Calendar className="w-4 h-4" />
              <span>First met {new Date(contact.first_met_date).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Contact Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <Mail className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="text-white font-medium">{contact.email}</p>
              </div>
            </div>
          </a>
        )}

        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Phone className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Phone</p>
                <p className="text-white font-medium">{contact.phone}</p>
              </div>
            </div>
          </a>
        )}

        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Linkedin className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500">LinkedIn</p>
                <p className="text-white font-medium">View Profile</p>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-500" />
            </div>
          </a>
        )}

        {contact.last_met_date && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Last Met</p>
                <p className="text-white font-medium">
                  {new Date(contact.last_met_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Relationship Intelligence - Aggregated insights */}
      {(allInterests.size > 0 || allConcerns.size > 0 || allAsks.size > 0 || allQuotes.length > 0) && (
        <div className="bg-gradient-to-r from-indigo-600/10 to-purple-600/10 border border-indigo-500/20 rounded-xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Relationship Intelligence</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allInterests.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-medium text-slate-300">Their Interests</h3>
                </div>
                <ul className="space-y-1">
                  {Array.from(allInterests).slice(0, 5).map((interest, i) => (
                    <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                      <span className="text-emerald-500 mt-1">•</span>
                      {interest}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {allConcerns.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-medium text-slate-300">Their Concerns</h3>
                </div>
                <ul className="space-y-1">
                  {Array.from(allConcerns).slice(0, 5).map((concern, i) => (
                    <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                      <span className="text-amber-500 mt-1">•</span>
                      {concern}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {allAsks.size > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-medium text-slate-300">Their Asks</h3>
                </div>
                <ul className="space-y-1">
                  {Array.from(allAsks).slice(0, 5).map((ask, i) => (
                    <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                      <span className="text-purple-500 mt-1">•</span>
                      {ask}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {allQuotes.length > 0 && (
              <div className="md:col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-medium text-slate-300">Notable Quotes</h3>
                </div>
                <ul className="space-y-2">
                  {allQuotes.slice(0, 3).map((quote, i) => (
                    <li key={i} className="text-sm text-slate-400 italic border-l-2 border-blue-500/30 pl-3">
                      &ldquo;{quote}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {contact.notes && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
          <h2 className="text-sm font-medium text-slate-400 mb-3">Notes</h2>
          <p className="text-slate-300 whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      {/* Meeting History with Context */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-white">Meeting History</h2>
        </div>

        {relatedMemos.length > 0 ? (
          <div className="space-y-4">
            {relatedMemos.map((memo) => (
              <div
                key={memo.id}
                className="border border-slate-800 rounded-lg overflow-hidden"
              >
                <Link
                  href={`/memos/${memo.id}`}
                  className="flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                >
                  <div>
                    <p className="text-slate-200 font-medium">{memo.title}</p>
                    {memo.summary && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                        {memo.summary}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {memo.context?.sentiment && sentimentLabels[memo.context.sentiment] && (
                      <span className={`text-xs ${sentimentLabels[memo.context.sentiment].color}`}>
                        {sentimentLabels[memo.context.sentiment].label}
                      </span>
                    )}
                    {memo.meeting_date && (
                      <span className="text-xs text-slate-500">
                        {new Date(memo.meeting_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </Link>

                {/* Meeting context details */}
                {memo.context && (
                  <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {memo.context.discussion_topics && memo.context.discussion_topics.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Topics Discussed</p>
                          <div className="flex flex-wrap gap-1">
                            {memo.context.discussion_topics.map((topic, i) => (
                              <span key={i} className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-300">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {memo.context.follow_up_items && memo.context.follow_up_items.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                            <CheckSquare className="w-3 h-3" />
                            Follow-ups
                          </p>
                          <ul className="space-y-0.5">
                            {memo.context.follow_up_items.map((item, i) => (
                              <li key={i} className="text-xs text-slate-400">• {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {memo.context.key_quotes && memo.context.key_quotes.length > 0 && (
                        <div className="md:col-span-2">
                          <p className="text-xs text-slate-500 mb-1">Key Quote</p>
                          <p className="text-xs text-slate-400 italic">
                            &ldquo;{memo.context.key_quotes[0]}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-4">
            No meetings linked to this contact yet
          </p>
        )}
      </div>

      {/* Metadata footer */}
      <div className="mt-8 pt-6 border-t border-slate-800 text-sm text-slate-500">
        <p>
          Added {new Date(contact.created_at).toLocaleDateString()} · Last updated{' '}
          {new Date(contact.updated_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}
