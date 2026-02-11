import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const maxDuration = 120

// Use Claude Haiku for fast, reliable extraction
async function callAI(prompt: string): Promise<string> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('[Claude] API error:', JSON.stringify(data))
    throw new Error(`Claude API error: ${response.status} - ${data.error?.message || JSON.stringify(data)}`)
  }

  if (!data.content || !data.content[0]) {
    console.error('[Claude] Unexpected response:', JSON.stringify(data))
    throw new Error('Claude returned unexpected response')
  }

  return data.content[0].text
}

interface ExtractedContact {
  name: string
  email?: string
  title?: string
  company?: string
  phone?: string
  linkedin_url?: string
  relationship_type?: string
  notes?: string
  meeting_context?: {
    their_interests?: string[]
    their_concerns?: string[]
    their_asks?: string[]
    key_quotes?: string[]
    follow_up_items?: string[]
    discussion_topics?: string[]
    sentiment?: string
    engagement_level?: string
  }
}

async function extractContactsFromMemo(content: string, userName?: string): Promise<ExtractedContact[]> {
  // Use more content to catch names mentioned later
  const excludeNote = userName ? `EXCLUDE: "${userName}" (the user who wrote this memo)` : ''

  const prompt = `You are analyzing a meeting memo to extract ONLY HUMAN PEOPLE mentioned for a CRM.

${excludeNote}

CRITICAL RULES:
1. Extract ONLY individual human beings (people with first/last names)
2. DO NOT extract:
   - Company names (e.g., "Red Point", "G2", "Artisanal Ventures", "Myprize")
   - VC fund names (e.g., "Sequoia", "a]6z", "First Round")
   - Location names (e.g., "TNEC", "NYC", "San Francisco")
   - Product names or services
   - Generic titles without names (e.g., "the CEO", "an investor")
   - Industry terms (e.g., "executive search", "SaaS")

EXTRACT these types of people:
- Meeting participants (actual people with names)
- People mentioned by first name only (e.g., "Assaf", "Trent", "Mike")
- LPs, advisors, founders mentioned BY NAME
- Anyone referred to as a person with an actual name

For each PERSON, extract:
- name: Their human name (first name OK if that's all mentioned)
- title: Job title if mentioned
- company: Company they work at if mentioned
- relationship_type: One of: founder, investor, advisor, executive, operator, other
- notes: Brief context about who they are

Return ONLY a valid JSON array. If no people are mentioned, return [].

EXAMPLE: For "Met with Trent Herren from Red Point Ventures. Discussed G2 and Myprize. Mike referred the deal."

CORRECT extraction (only people):
[
  {"name": "Trent Herren", "company": "Red Point Ventures", "relationship_type": "investor", "notes": "Meeting participant"},
  {"name": "Mike", "relationship_type": "other", "notes": "Referred the deal"}
]

WRONG (do not include companies as contacts):
[
  {"name": "Red Point Ventures"}, // NO - this is a company
  {"name": "G2"}, // NO - this is a company
  {"name": "Myprize"} // NO - this is a company
]

Now extract ONLY PEOPLE from this memo:

MEMO CONTENT:
${content.slice(0, 12000)}`

  try {
    console.log('[Backfill] Calling Claude for contact extraction...')
    const result = await callAI(prompt)
    console.log('[Backfill] Raw AI response:', result.slice(0, 500))

    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.log('[Backfill] No JSON array found in response')
      return []
    }

    const parsed = JSON.parse(jsonMatch[0])
    console.log('[Backfill] Parsed contacts:', JSON.stringify(parsed.map((c: ExtractedContact) => c.name)))

    // Filter out empty names and the user's own name
    const userNameLower = (userName || '').toLowerCase()
    const filtered = parsed.filter((c: ExtractedContact) => {
      if (!c.name || c.name.trim().length === 0) return false
      const nameLower = c.name.toLowerCase()
      // Exclude if it matches user's name (full or partial)
      if (userNameLower && (nameLower.includes(userNameLower) || userNameLower.includes(nameLower))) {
        console.log(`[Backfill] Excluding user's own name: ${c.name}`)
        return false
      }
      return true
    })
    console.log(`[Backfill] Extracted ${filtered.length} contacts (after filtering): ${filtered.map((c: ExtractedContact) => c.name).join(', ')}`)

    return filtered
  } catch (error) {
    console.error('[Backfill] Contact extraction error:', error)
    return []
  }
}

export async function POST() {
  console.log('[Contacts Backfill] Starting...')

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()

    // Get all memos for this user
    const { data: memos, error: memosError } = await (adminClient
      .from('memos') as ReturnType<typeof adminClient.from>)
      .select('id, title, content, meeting_date, company_id')
      .eq('user_id', user.id)
      .order('meeting_date', { ascending: false }) as {
        data: Array<{ id: string; title: string; content: string | null; meeting_date: string | null; company_id: string | null }> | null
        error: Error | null
      }

    if (memosError) {
      console.error('[Backfill] Error fetching memos:', memosError)
      return NextResponse.json({ error: 'Failed to fetch memos' }, { status: 500 })
    }

    if (!memos || memos.length === 0) {
      return NextResponse.json({ message: 'No memos to process', processed: 0 })
    }

    console.log(`[Backfill] Processing ${memos.length} memos for contacts...`)

    // Get user's name to exclude from extraction
    const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || ''

    let totalContacts = 0
    let processedMemos = 0

    for (const memo of memos) {
      try {
        // Skip if no content
        if (!memo.content) continue

        // Extract contacts from memo content (pass user name to exclude)
        console.log(`[Backfill] Processing memo: ${memo.title} (${memo.id})`)
        const contacts = await extractContactsFromMemo(memo.content, userName)

        console.log(`[Backfill] Extracted ${contacts.length} contacts:`, contacts.map(c => c.name))

        if (contacts.length === 0) {
          console.log(`[Backfill] No contacts found in memo: ${memo.title}`)
          processedMemos++
          continue
        }

        // Process each contact
        for (const contact of contacts) {
          try {
            // Check if contact exists
            let existingContact = null

            if (contact.email) {
              const { data } = await (adminClient
                .from('contacts') as ReturnType<typeof adminClient.from>)
                .select('id, notes, relationship_type')
                .eq('user_id', user.id)
                .eq('email', contact.email)
                .single() as { data: { id: string; notes: string | null; relationship_type: string | null } | null }
              existingContact = data
            }

            if (!existingContact) {
              const { data } = await (adminClient
                .from('contacts') as ReturnType<typeof adminClient.from>)
                .select('id, notes, relationship_type')
                .eq('user_id', user.id)
                .ilike('name', contact.name)
                .single() as { data: { id: string; notes: string | null; relationship_type: string | null } | null }
              existingContact = data
            }

            let contactId: string

            if (existingContact) {
              // Update existing contact
              console.log(`[Backfill] Contact "${contact.name}" already exists (id: ${existingContact.id}), updating...`)
              const updateData: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
              }

              if (contact.email && !existingContact.notes?.includes(contact.email)) {
                updateData.email = contact.email
              }
              if (contact.title) updateData.title = contact.title
              if (contact.phone) updateData.phone = contact.phone
              if (contact.linkedin_url) updateData.linkedin_url = contact.linkedin_url
              if (contact.relationship_type && !existingContact.relationship_type) {
                updateData.relationship_type = contact.relationship_type
              }
              if (memo.company_id) updateData.company_id = memo.company_id

              await (adminClient.from('contacts') as ReturnType<typeof adminClient.from>)
                .update(updateData as never)
                .eq('id', existingContact.id)

              contactId = existingContact.id
            } else {
              // Create new contact
              const insertData: Record<string, unknown> = {
                user_id: user.id,
                name: contact.name,
              }

              if (contact.email) insertData.email = contact.email
              if (contact.title) insertData.title = contact.title
              if (contact.phone) insertData.phone = contact.phone
              if (contact.linkedin_url) insertData.linkedin_url = contact.linkedin_url
              if (contact.relationship_type) insertData.relationship_type = contact.relationship_type
              if (contact.notes) insertData.notes = contact.notes
              if (memo.company_id) insertData.company_id = memo.company_id

              const { data: newContact, error: insertError } = await (adminClient
                .from('contacts') as ReturnType<typeof adminClient.from>)
                .insert(insertData as never)
                .select('id')
                .single() as { data: { id: string } | null; error: unknown }

              if (insertError || !newContact) {
                console.error(`[Backfill] Failed to create contact ${contact.name}:`, insertError)
                continue
              }

              contactId = newContact.id
              totalContacts++
              console.log(`[Backfill] Created new contact "${contact.name}" (id: ${contactId})`)
            }

            // Link contact to memo with context
            const meetingContext = contact.meeting_context || {}
            await (adminClient.from('contact_memos') as ReturnType<typeof adminClient.from>)
              .upsert({
                contact_id: contactId,
                memo_id: memo.id,
                context: {
                  their_interests: meetingContext.their_interests || [],
                  their_concerns: meetingContext.their_concerns || [],
                  their_asks: meetingContext.their_asks || [],
                  key_quotes: meetingContext.key_quotes || [],
                  follow_up_items: meetingContext.follow_up_items || [],
                  discussion_topics: meetingContext.discussion_topics || [],
                  sentiment: meetingContext.sentiment || null,
                  engagement_level: meetingContext.engagement_level || null,
                  meeting_date: memo.meeting_date,
                },
                created_at: new Date().toISOString(),
              } as never, { onConflict: 'contact_id,memo_id' })

          } catch (contactErr) {
            console.error(`[Backfill] Error processing contact:`, contactErr)
          }
        }

        processedMemos++

        // Small delay between memos
        await new Promise(resolve => setTimeout(resolve, 500))

      } catch (memoErr) {
        console.error(`[Backfill] Error processing memo ${memo.id}:`, memoErr)
      }
    }

    console.log(`[Backfill] Complete! Processed ${processedMemos} memos, created ${totalContacts} new contacts`)

    return NextResponse.json({
      success: true,
      processed_memos: processedMemos,
      new_contacts: totalContacts,
    })

  } catch (error) {
    console.error('[Backfill] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
