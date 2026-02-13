import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface MemoResult {
  id: string
  title: string
  content: string
  meeting_date: string | null
}

interface StatsResult {
  total_memos: number
  total_companies: number
  active_deals: number
  pending_tasks: number
}

interface Contact {
  id: string
  name: string
  email: string | null
  title: string | null
  company_id: string | null
  companies: { name: string } | null
  last_contacted: string | null
  notes: string | null
}

interface Company {
  id: string
  name: string
  website: string | null
  stage: string | null
  sector: string | null
  location: string | null
  description: string | null
  notes: string | null
}

interface Reminder {
  id: string
  type: string
  title: string
  context: string | null
  due_date: string | null
  status: string
  contacts: { name: string } | null
  companies: { name: string } | null
}

export async function POST(request: Request) {
  try {
    const { message, conversationId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all user data in parallel for comprehensive context
    // @ts-expect-error - Supabase RPC types
    const { data: relevantMemos } = await supabase.rpc('search_memos', {
      search_query: message,
      p_user_id: user.id,
      result_limit: 5,
    }) as { data: MemoResult[] | null }

    const { data: contactsData } = await supabase
      .from('contacts')
      .select('id, name, email, title, company_id, companies(name), last_contacted, notes')
      .eq('user_id', user.id)
      .order('last_contacted', { ascending: false, nullsFirst: false })
      .limit(100)

    const { data: companiesData } = await supabase
      .from('companies')
      .select('id, name, website, stage, sector, location, description, notes')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100)

    const { data: remindersData } = await supabase
      .from('reminders')
      .select('id, type, title, context, due_date, status, contacts(name), companies(name)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(50)

    // @ts-expect-error - Supabase RPC types
    const { data: stats } = await supabase.rpc('get_user_stats', {
      p_user_id: user.id,
    }) as { data: StatsResult | null }

    const contacts = (contactsData || []) as Contact[]
    const companies = (companiesData || []) as Company[]
    const reminders = (remindersData || []) as Reminder[]

    // Build context from relevant memos
    let memoContext = ''
    const sources: Array<{ id: string; title: string }> = []

    if (relevantMemos && relevantMemos.length > 0) {
      memoContext = relevantMemos
        .map((memo) => {
          sources.push({ id: memo.id, title: memo.title })
          return `Meeting: ${memo.title}
Date: ${memo.meeting_date ? new Date(memo.meeting_date).toLocaleDateString() : 'Unknown'}
Content: ${memo.content.slice(0, 1500)}${memo.content.length > 1500 ? '...' : ''}`
        })
        .join('\n\n')
    }

    // Build contacts context
    const contactsContext = contacts.length > 0
      ? contacts.map(c => {
          const companyName = c.companies?.name || 'No company'
          const lastContact = c.last_contacted
            ? new Date(c.last_contacted).toLocaleDateString()
            : 'Never'
          return `- ${c.name}${c.title ? ` (${c.title})` : ''} at ${companyName} | Last contact: ${lastContact}${c.email ? ` | Email: ${c.email}` : ''}${c.notes ? ` | Notes: ${c.notes.slice(0, 100)}` : ''}`
        }).join('\n')
      : 'No contacts yet'

    // Build companies context
    const companiesContext = companies.length > 0
      ? companies.map(c => {
          return `- ${c.name}${c.stage ? ` (${c.stage})` : ''}${c.sector ? ` | Sector: ${c.sector}` : ''}${c.location ? ` | Location: ${c.location}` : ''}${c.description ? ` | ${c.description.slice(0, 150)}` : ''}`
        }).join('\n')
      : 'No companies tracked yet'

    // Build reminders context
    const remindersContext = reminders.length > 0
      ? reminders.map(r => {
          const dueDate = r.due_date ? new Date(r.due_date).toLocaleDateString() : 'No due date'
          const relatedTo = r.contacts?.name || r.companies?.name || ''
          return `- [${r.type}] ${r.title}${relatedTo ? ` (${relatedTo})` : ''} | Due: ${dueDate}`
        }).join('\n')
      : 'No pending reminders'

    const systemContext = `You are an AI assistant helping a venture capitalist manage their deal flow, contacts, and meeting notes. You have FULL ACCESS to their complete database including all contacts, companies, memos, and reminders.

## PORTFOLIO OVERVIEW
- Total memos: ${stats?.total_memos || 0}
- Total companies tracked: ${companies.length}
- Total contacts: ${contacts.length}
- Pending reminders: ${reminders.length}

## ALL CONTACTS (${contacts.length} people)
${contactsContext}

## ALL COMPANIES (${companies.length} companies)
${companiesContext}

## PENDING REMINDERS & FOLLOW-UPS (${reminders.length} items)
${remindersContext}

${memoContext ? `## RELEVANT MEETING NOTES\n${memoContext}` : ''}

## INSTRUCTIONS
- You have complete visibility into ALL contacts, companies, and reminders listed above
- When asked about contacts or companies, reference the specific data provided
- If asked "who should I follow up with" or similar, analyze the contacts and reminders
- Help identify patterns, suggest follow-ups, and provide insights from the data
- Be specific - cite names, companies, and dates when relevant
- Be concise and professional`

    // Generate response using Claude
    const { text } = await generateText({
      model: anthropic('claude-3-haiku-20240307'),
      system: systemContext,
      prompt: message,
    })

    // Create or update conversation
    let currentConversationId = conversationId

    if (!currentConversationId) {
      // Create new conversation
      const result = await (supabase.from('conversations') as ReturnType<typeof supabase.from>)
        .insert({
          user_id: user.id,
          title: message.slice(0, 100),
        } as never)
        .select('id')
        .single() as unknown as { data: { id: string } | null, error: Error | null }

      if (result.error) {
        console.error('Error creating conversation:', result.error)
      } else if (result.data) {
        currentConversationId = result.data.id
      }
    } else {
      // Update conversation timestamp
      await (supabase.from('conversations') as ReturnType<typeof supabase.from>)
        .update({ updated_at: new Date().toISOString() } as never)
        .eq('id', currentConversationId)
    }

    // Save messages to database
    if (currentConversationId) {
      // Save user message
      await (supabase.from('messages') as ReturnType<typeof supabase.from>).insert({
        conversation_id: currentConversationId,
        role: 'user',
        content: message,
      } as never)

      // Save assistant message
      const msgResult = await (supabase.from('messages') as ReturnType<typeof supabase.from>)
        .insert({
          conversation_id: currentConversationId,
          role: 'assistant',
          content: text,
          sources: sources,
        } as never)
        .select('id')
        .single() as unknown as { data: { id: string } | null }

      return NextResponse.json({
        response: text,
        sources: sources.length > 0 ? sources : undefined,
        conversationId: currentConversationId,
        messageId: msgResult.data?.id,
      })
    }

    return NextResponse.json({
      response: text,
      sources: sources.length > 0 ? sources : undefined,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    )
  }
}
