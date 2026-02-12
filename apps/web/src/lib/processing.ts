import { createAdminClient } from '@/lib/supabase/server'
import { createMemoInDrive } from '@/lib/google/drive'
import { sendEmail, memoProcessedEmail } from '@/lib/email'
import { trackServerEvent } from '@/lib/analytics-server'

// Use Claude API for all AI processing

interface ProcessInput {
  source: 'fireflies' | 'granola' | 'manual'
  transcriptId?: string
  transcriptContent?: string
  userId: string
  jobId?: string
  metadata?: {
    title?: string
    date?: string
    participants?: string[]
  }
}

interface ProcessResult {
  success: boolean
  memoId?: string
  companyName?: string
  contactsCreated?: number
  remindersCreated?: number
  error?: string
}

interface ExtractedContact {
  name: string
  email?: string
  title?: string
  company?: string
  phone?: string
  linkedin_url?: string
  relationship_type?: 'founder' | 'investor' | 'advisor' | 'executive' | 'operator' | 'other'
  notes?: string
  // Per-meeting context (stored in contact_memos)
  meeting_context?: {
    their_interests?: string[]      // What they're interested in
    their_concerns?: string[]       // Concerns or objections raised
    their_asks?: string[]           // What they asked for
    key_quotes?: string[]           // Notable things they said
    follow_up_items?: string[]      // Suggested follow-ups
    discussion_topics?: string[]    // Main topics discussed with them
    sentiment?: 'very_positive' | 'positive' | 'neutral' | 'skeptical' | 'negative'
    engagement_level?: 'high' | 'medium' | 'low'
  }
}

interface ExtractedCommitment {
  type: 'commitment' | 'follow_up' | 'intro_request' | 'deadline'
  title: string
  context: string
  source_text: string
  related_person?: string
  due_date?: string // ISO date if mentioned
  priority: 'low' | 'medium' | 'high'
}

/**
 * Call Claude API for AI processing
 */
async function callClaude(prompt: string, systemPrompt?: string): Promise<string> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  // Combine system prompt with user prompt for Claude
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt

  console.log('[Claude] Calling API...')

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
      messages: [{ role: 'user', content: fullPrompt }],
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    console.error('[Claude API Error]', response.status, errorData)
    throw new Error(`Claude API error: ${response.status} - ${errorData.error?.message || 'Unknown'}`)
  }

  const data = await response.json()
  const content = data.content?.[0]?.text || ''
  console.log('[Claude] Response received, length:', content.length)
  return content
}

/**
 * Fetch transcript from Fireflies API
 */
async function fetchFirefliesTranscript(
  apiKey: string,
  transcriptId: string
): Promise<{ title: string; date: string; transcript: string; participants: string[] }> {
  const cleanApiKey = apiKey.trim()

  console.log('[Fireflies] Fetching transcript:', transcriptId)

  const response = await fetch('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cleanApiKey}`,
    },
    body: JSON.stringify({
      query: `
        query Transcript($id: String!) {
          transcript(id: $id) {
            title
            date
            sentences { text speaker_name }
          }
        }
      `,
      variables: { id: transcriptId },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Fireflies API Error]', response.status, errorText)
    throw new Error(`Fireflies API error: ${response.status}`)
  }

  const data = await response.json()
  if (data.errors) {
    console.error('[Fireflies GraphQL Error]', data.errors)
    throw new Error(data.errors[0]?.message || 'Fireflies API error')
  }

  if (!data?.data?.transcript) {
    throw new Error('Fireflies transcript not found')
  }

  const ffTranscript = data.data.transcript
  const transcript = ffTranscript.sentences
    .map((s: { speaker_name: string; text: string }) => `${s.speaker_name}: ${s.text}`)
    .join('\n')

  const speakers = new Set(ffTranscript.sentences.map((s: { speaker_name: string }) => s.speaker_name))

  console.log('[Fireflies] Transcript fetched, length:', transcript.length, 'speakers:', speakers.size)

  return {
    title: ffTranscript.title,
    date: ffTranscript.date,
    transcript,
    participants: Array.from(speakers) as string[],
  }
}

/**
 * Detect meeting type from transcript
 */
async function detectMeetingType(transcript: string): Promise<string> {
  const prompt = `You are classifying a meeting transcript for a VC investor. Analyze the content and participants to determine the meeting type.

Categories:
- founder-pitch: A startup founder pitching their company to a VC for investment
- portfolio-update: Check-in with a portfolio company the VC has already invested in
- due-diligence: Reference calls, background checks, or deep-dive research on a company
- vc-catchup: Two or more VCs catching up, sharing deal flow, discussing market trends
- lp-meeting: Meeting with limited partners (LPs) or fund investors
- board-meeting: Board meeting or formal investor update
- partner-meeting: Partnership, BD, or collaboration discussions
- customer-call: Customer discovery, sales, or product feedback call
- recruiting: Interview or recruiting conversation
- internal: Internal team meeting, planning, or operations
- networking: General networking, relationship building, or informal catch-up

Key signals:
- If two VCs are discussing deals, startups, or market trends → vc-catchup
- If a founder is presenting metrics, product, or asking for money → founder-pitch
- If discussing a company the VC already invested in → portfolio-update
- If making reference calls about a founder or company → due-diligence

Return ONLY the category ID (e.g., "founder-pitch", "vc-catchup"). Be specific - don't default to "internal" unless it truly is an internal team meeting.

Transcript excerpt:
${transcript.slice(0, 3000)}`

  try {
    const result = await callClaude(prompt)
    const category = result.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, '-')

    const validTypes = [
      'founder-pitch', 'portfolio-update', 'due-diligence', 'vc-catchup',
      'lp-meeting', 'board-meeting', 'partner-meeting', 'customer-call',
      'recruiting', 'internal', 'networking'
    ]

    if (validTypes.includes(category)) {
      return category
    }

    // Try to match partial
    for (const type of validTypes) {
      if (category.includes(type) || type.includes(category)) {
        return type
      }
    }

    // Default based on keywords in the response
    if (category.includes('vc') || category.includes('investor') || category.includes('deal')) {
      return 'vc-catchup'
    }
    if (category.includes('pitch') || category.includes('founder') || category.includes('startup')) {
      return 'founder-pitch'
    }

    return 'internal'
  } catch (error) {
    console.error('[Meeting Type Detection Error]', error)
    return 'internal'
  }
}

/**
 * Detect company from transcript
 */
async function detectCompany(
  transcript: string,
  existingCompanies: Array<{ id: string; name: string }>
): Promise<{ name: string; existingId?: string; confidence: number; metadata: Record<string, string> } | null> {
  const companyList = existingCompanies.length > 0
    ? `Known companies in the system: ${existingCompanies.map(c => c.name).join(', ')}`
    : ''

  const prompt = `Extract company information from this meeting transcript.

${companyList}

Return a JSON object with:
- name: Company name being discussed (or null if not identifiable)
- isExisting: true if it matches one of the known companies listed above
- confidence: 0-1 confidence score
- website: Company website if mentioned
- industry: Industry if identifiable
- stage: Funding stage if mentioned (seed, series-a, etc.)

Return ONLY valid JSON, no other text.

Transcript:
${transcript.slice(0, 3000)}`

  try {
    const result = await callClaude(prompt)

    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.name || parsed.name === 'null') return null

    let existingId: string | undefined
    if (parsed.isExisting) {
      const match = existingCompanies.find(
        c => c.name.toLowerCase() === parsed.name.toLowerCase()
      )
      if (match) existingId = match.id
    }

    return {
      name: parsed.name,
      existingId,
      confidence: parsed.confidence || 0.5,
      metadata: {
        website: parsed.website || '',
        industry: parsed.industry || '',
        stage: parsed.stage || '',
      },
    }
  } catch (error) {
    console.error('[Company Detection Error]', error)
    return null
  }
}

/**
 * Generate memo content from transcript
 */
async function generateMemoContent(transcript: string, meetingType: string): Promise<string> {
  const systemPrompt = `You are an AI assistant for venture capital investors. Generate professional, structured meeting memos from transcripts. Be concise and focus on actionable insights.`

  const templatePrompts: Record<string, string> = {
    'founder-pitch': `Generate a VC investment memo from this founder pitch meeting. Include these sections:

## Executive Summary
2-3 sentence overview of the company and meeting

## Company Overview
- Company name and what they do
- Stage and funding history

## Problem & Solution
- Problem being solved
- Their solution/product

## Market Opportunity
- Target market size
- Go-to-market strategy

## Business Model
- How they make money
- Key metrics

## Team
- Founders and backgrounds
- Key hires needed

## Traction
- Current metrics
- Growth trajectory

## Investment Ask
- Amount raising
- Use of funds

## Key Concerns
- Risks and red flags

## Next Steps
- Follow-up actions needed`,

    'customer-call': `Generate a customer discovery memo. Include:

## Customer Overview
- Who they are
- Company/role

## Key Pain Points
- Problems they're experiencing

## Current Solutions
- What they use today
- Limitations

## Feature Requests
- What they want

## Willingness to Pay
- Budget and urgency

## Next Steps`,

    'due-diligence': `Generate a due diligence memo. Include:

## Reference Overview
- Who provided the reference
- Relationship to company

## Key Findings
- What they said about the company/team

## Strengths
- Positive aspects mentioned

## Concerns
- Any red flags or worries

## Recommendation
- Overall assessment`,

    'internal': `Generate a meeting summary. Include:

## Meeting Purpose
- Why we met

## Key Discussion Points
- Main topics covered

## Decisions Made
- What was decided

## Action Items
- Who does what by when

## Next Steps`,

    'vc-catchup': `Generate a VC catch-up memo. This is a meeting between investors discussing deals, market trends, and sharing deal flow. Include:

## Meeting Overview
- Who met and context

## Deal Flow Shared
- Companies discussed or referred
- Stage, sector, and any key details for each

## Market Insights
- Trends or themes discussed
- Sectors getting hot or cooling

## Portfolio Updates
- Any updates on shared portfolio companies

## Collaboration Opportunities
- Co-investment opportunities
- Intros to make

## Key Takeaways
- Main insights from the conversation

## Follow-ups
- Action items and next steps`,

    'portfolio-update': `Generate a portfolio company update memo. Include:

## Company Status
- Company name and current stage

## Key Metrics
- Revenue, growth, burn rate
- User/customer metrics

## Progress Since Last Check-in
- Milestones achieved
- Product updates

## Challenges
- Current obstacles
- Where they need help

## Runway & Fundraising
- Current runway
- Fundraising plans

## Action Items
- How we can help
- Follow-ups needed`,

    'lp-meeting': `Generate an LP meeting memo. Include:

## Meeting Overview
- LP name and context

## Fund Performance Discussion
- Performance updates shared
- Portfolio highlights

## LP Questions/Concerns
- Questions raised
- Concerns addressed

## Relationship Status
- Current investment level
- Interest in future funds

## Follow-ups
- Information to send
- Next meeting plans`,

    'board-meeting': `Generate a board meeting memo. Include:

## Meeting Overview
- Company and attendees

## Financial Review
- Key financial metrics
- Runway and burn

## Business Update
- Progress on goals
- Key wins and challenges

## Strategic Discussions
- Major decisions made
- Strategic pivots or plans

## Governance Items
- Formal resolutions
- Compliance matters

## Action Items
- Board member follow-ups
- Management commitments`,

    'recruiting': `Generate a recruiting/interview memo. Include:

## Candidate Overview
- Name, role, background

## Strengths
- Key qualifications
- Impressive experiences

## Concerns
- Gaps or red flags
- Areas to probe further

## Culture Fit
- Team dynamics assessment

## Recommendation
- Hire/No hire/Next steps

## Follow-ups
- Reference checks needed
- Next interview stages`,

    'networking': `Generate a networking meeting memo. Include:

## Meeting Overview
- Who met and context

## Key Topics Discussed
- Main conversation themes

## Interesting Insights
- Valuable information shared

## Potential Opportunities
- Ways to collaborate or help each other

## Follow-ups
- Intros to make
- Information to share
- Next steps`,

    'partner-meeting': `Generate a partnership discussion memo. Include:

## Partner Overview
- Company/person and their focus

## Partnership Opportunity
- What was proposed
- Potential value

## Terms Discussed
- Key deal points
- Structure considerations

## Concerns
- Risks or blockers

## Next Steps
- Follow-up actions
- Decision timeline`,
  }

  const prompt = `${templatePrompts[meetingType] || templatePrompts['internal']}

Be concise but thorough. Extract specific numbers, quotes, and facts when available.
If information isn't available for a section, write "Not discussed in meeting."

Transcript:
${transcript.slice(0, 6000)}`

  return await callClaude(prompt, systemPrompt)
}

/**
 * Generate a brief summary
 */
async function generateSummary(transcript: string): Promise<string> {
  return await callClaude(`Summarize this meeting in 2-3 sentences. Be specific about what was discussed and any key outcomes:\n\n${transcript.slice(0, 2000)}`)
}

/**
 * Extract participant/contact information from transcript
 */
async function extractParticipants(transcript: string, speakerNames: string[]): Promise<ExtractedContact[]> {
  const prompt = `You are analyzing a meeting transcript to build a CRM. Extract ONLY HUMAN PEOPLE mentioned.

SPEAKER NAMES FROM MEETING: ${speakerNames.join(', ')}

CRITICAL RULES:
1. Extract ONLY individual human beings with names
2. DO NOT extract:
   - Company names (e.g., "Sequoia", "Google", "TechStartup Inc")
   - VC fund names (e.g., "a16z", "First Round")
   - Product names or services
   - Location names
3. DO extract:
   - All speakers/participants listed above
   - People mentioned by first name only (e.g., "Shane", "Trent")
   - Co-founders, team members, advisors mentioned BY NAME

ONLY exclude the VC/investor who is hosting the meeting.

For each person, extract what you can find:

BASIC INFO:
- name: Their name (first name only is OK if that's all mentioned)
- email: Email if mentioned
- title: Job title/role if mentioned
- company: Their company if mentioned
- phone: Phone number if mentioned
- linkedin_url: LinkedIn URL if mentioned
- relationship_type: One of: founder, investor, advisor, executive, operator, other
- notes: Brief context about who they are

MEETING CONTEXT (what happened in THIS meeting):
- their_interests: Array of things they expressed interest in
- their_concerns: Array of concerns, objections, or hesitations they raised
- their_asks: Array of specific requests they made (intros, follow-ups, info needed)
- key_quotes: Array of important/memorable things they said (direct quotes if possible)
- follow_up_items: Array of suggested follow-ups based on the conversation
- discussion_topics: Array of main topics discussed with them
- sentiment: Their overall tone (very_positive, positive, neutral, skeptical, negative)
- engagement_level: How engaged they were (high, medium, low)

Return ONLY a valid JSON array. Include everyone, even with minimal info. Example:
[{
  "name": "Sarah Chen",
  "title": "CEO & Co-founder",
  "company": "TechStartup Inc",
  "relationship_type": "founder",
  "notes": "First meeting, pitching Series A",
  "meeting_context": {
    "their_interests": ["AI infrastructure", "enterprise sales motion"],
    "their_concerns": ["runway concerns if deal takes too long"],
    "their_asks": ["intro to portfolio company"],
    "key_quotes": ["We're seeing 40% MoM growth"],
    "follow_up_items": ["Send portfolio company intro"],
    "discussion_topics": ["product roadmap", "go-to-market strategy"],
    "sentiment": "positive",
    "engagement_level": "high"
  }
},
{
  "name": "Trent",
  "title": "CTO",
  "company": "TechStartup Inc",
  "relationship_type": "founder",
  "notes": "Co-founder, technical lead"
}]

TRANSCRIPT:
${transcript.slice(0, 10000)}`

  try {
    const result = await callClaude(prompt)
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    return parsed.filter((c: ExtractedContact) => c.name && c.name.trim().length > 0)
  } catch (error) {
    console.error('[Contact Extraction Error]', error)
    return []
  }
}

/**
 * Create or update contacts in the database with rich meeting context
 */
async function createOrUpdateContacts(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  contacts: ExtractedContact[],
  memoId: string,
  companyId: string | null,
  meetingDate: string | null
): Promise<number> {
  let createdCount = 0

  for (const contact of contacts) {
    try {
      // Check if contact already exists by email, linkedin, or name
      let existingContact = null

      // Try email first (most reliable)
      if (contact.email) {
        const { data } = await (adminClient
          .from('contacts') as ReturnType<typeof adminClient.from>)
          .select('id, notes, relationship_type')
          .eq('user_id', userId)
          .eq('email', contact.email)
          .single() as { data: { id: string; notes: string | null; relationship_type: string | null } | null }
        existingContact = data
      }

      // Try LinkedIn URL
      if (!existingContact && contact.linkedin_url) {
        const { data } = await (adminClient
          .from('contacts') as ReturnType<typeof adminClient.from>)
          .select('id, notes, relationship_type')
          .eq('user_id', userId)
          .eq('linkedin_url', contact.linkedin_url)
          .single() as { data: { id: string; notes: string | null; relationship_type: string | null } | null }
        existingContact = data
      }

      // Fall back to fuzzy name matching
      if (!existingContact) {
        const { data } = await (adminClient
          .from('contacts') as ReturnType<typeof adminClient.from>)
          .select('id, notes, relationship_type')
          .eq('user_id', userId)
          .ilike('name', contact.name)
          .single() as { data: { id: string; notes: string | null; relationship_type: string | null } | null }
        existingContact = data
      }

      let contactId: string

      if (existingContact) {
        // Update existing contact with new info
        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        }

        // Append new notes with date context
        if (contact.notes) {
          const existingNotes = existingContact.notes || ''
          const datestamp = meetingDate ? new Date(meetingDate).toLocaleDateString() : new Date().toLocaleDateString()
          updateData.notes = existingNotes
            ? `${existingNotes}\n\n[${datestamp}] ${contact.notes}`
            : `[${datestamp}] ${contact.notes}`
        }

        // Update fields if we have new info and they're not already set
        if (contact.email) updateData.email = contact.email
        if (contact.title) updateData.title = contact.title
        if (contact.phone) updateData.phone = contact.phone
        if (contact.linkedin_url) updateData.linkedin_url = contact.linkedin_url
        if (contact.relationship_type && !existingContact.relationship_type) {
          updateData.relationship_type = contact.relationship_type
        }
        if (companyId) updateData.company_id = companyId

        await (adminClient.from('contacts') as ReturnType<typeof adminClient.from>)
          .update(updateData as never)
          .eq('id', existingContact.id)

        contactId = existingContact.id
        console.log(`[Contacts] Updated existing contact: ${contact.name}`)
      } else {
        // Create new contact
        const insertData: Record<string, unknown> = {
          user_id: userId,
          name: contact.name,
        }

        if (contact.email) insertData.email = contact.email
        if (contact.title) insertData.title = contact.title
        if (contact.phone) insertData.phone = contact.phone
        if (contact.linkedin_url) insertData.linkedin_url = contact.linkedin_url
        if (contact.relationship_type) insertData.relationship_type = contact.relationship_type
        if (companyId) insertData.company_id = companyId
        if (contact.notes) {
          const datestamp = meetingDate ? new Date(meetingDate).toLocaleDateString() : new Date().toLocaleDateString()
          insertData.notes = `[${datestamp}] ${contact.notes}`
        }

        const { data: newContact, error } = await (adminClient
          .from('contacts') as ReturnType<typeof adminClient.from>)
          .insert(insertData as never)
          .select('id')
          .single() as { data: { id: string } | null; error: unknown }

        if (error || !newContact) {
          console.error(`[Contacts] Failed to create contact ${contact.name}:`, error)
          continue
        }

        contactId = newContact.id
        createdCount++
        console.log(`[Contacts] Created new contact: ${contact.name}`)
      }

      // Link contact to memo WITH rich meeting context
      const meetingContext = contact.meeting_context || {}
      await (adminClient.from('contact_memos') as ReturnType<typeof adminClient.from>)
        .upsert({
          contact_id: contactId,
          memo_id: memoId,
          context: {
            their_interests: meetingContext.their_interests || [],
            their_concerns: meetingContext.their_concerns || [],
            their_asks: meetingContext.their_asks || [],
            key_quotes: meetingContext.key_quotes || [],
            follow_up_items: meetingContext.follow_up_items || [],
            discussion_topics: meetingContext.discussion_topics || [],
            sentiment: meetingContext.sentiment || null,
            engagement_level: meetingContext.engagement_level || null,
            meeting_date: meetingDate,
          },
          created_at: new Date().toISOString(),
        } as never, { onConflict: 'contact_id,memo_id' })

      console.log(`[Contacts] Linked ${contact.name} to memo with ${Object.keys(meetingContext).length} context fields`)

    } catch (err) {
      console.error(`[Contacts] Error processing contact ${contact.name}:`, err)
    }
  }

  return createdCount
}

/**
 * Extract commitments and follow-ups from transcript for smart reminders
 */
async function extractCommitments(transcript: string, memoContent: string): Promise<ExtractedCommitment[]> {
  const prompt = `You are analyzing a meeting transcript to identify commitments, promises, and follow-up items that need to be tracked.

Extract ALL of the following:
1. COMMITMENTS: Things someone promised to do (e.g., "I'll send you the deck", "We'll schedule a follow-up")
2. FOLLOW-UPS: Action items that need follow-up (e.g., "Let's reconnect in two weeks", "Circle back after the board meeting")
3. INTRO REQUESTS: Requests for introductions (e.g., "Can you introduce me to...", "I'd love to meet...")
4. DEADLINES: Specific deadlines mentioned (e.g., "Need an answer by Friday", "Closing the round by end of month")

For each item, extract:
- type: "commitment", "follow_up", "intro_request", or "deadline"
- title: Brief description (max 80 chars)
- context: Why this matters or background context
- source_text: The actual quote or paraphrase from the transcript
- related_person: Name of person who made/requested this (if identifiable)
- due_date: ISO date (YYYY-MM-DD) if a specific date/time was mentioned, null otherwise
- priority: "high" if urgent/time-sensitive, "medium" for important follow-ups, "low" for nice-to-haves

IMPORTANT:
- Focus on actionable items, not general discussion points
- Extract commitments from BOTH the investor (you) and the other party
- Be specific about who needs to do what

Return ONLY a valid JSON array. If no commitments found, return [].

Example:
[{
  "type": "commitment",
  "title": "Send portfolio company intro",
  "context": "Founder asked for intro to portfolio company working on similar space",
  "source_text": "I'll connect you with Sarah from TechCo this week",
  "related_person": "Sarah Chen",
  "due_date": null,
  "priority": "medium"
},
{
  "type": "follow_up",
  "title": "Schedule follow-up call in 2 weeks",
  "context": "Waiting on product launch metrics before next discussion",
  "source_text": "Let's reconnect after your product launch",
  "related_person": "John Smith",
  "due_date": "2024-02-28",
  "priority": "medium"
}]

TRANSCRIPT:
${transcript.slice(0, 8000)}

MEMO SUMMARY:
${memoContent.slice(0, 2000)}`

  try {
    const result = await callClaude(prompt)
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    return parsed.filter((c: ExtractedCommitment) => c.title && c.type)
  } catch (error) {
    console.error('[Commitment Extraction Error]', error)
    return []
  }
}

/**
 * Create reminders from extracted commitments
 */
async function createReminders(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  commitments: ExtractedCommitment[],
  memoId: string,
  companyId: string | null,
  contactMap: Map<string, string> // name -> contact_id
): Promise<number> {
  let createdCount = 0

  for (const commitment of commitments) {
    try {
      // Try to find associated contact
      let contactId: string | null = null
      if (commitment.related_person) {
        // Check exact match first
        contactId = contactMap.get(commitment.related_person) || null

        // Try fuzzy match if no exact match
        if (!contactId) {
          const lowerName = commitment.related_person.toLowerCase()
          for (const [name, id] of contactMap.entries()) {
            if (name.toLowerCase().includes(lowerName) || lowerName.includes(name.toLowerCase())) {
              contactId = id
              break
            }
          }
        }
      }

      // Calculate due date
      let dueDate: string | null = null
      if (commitment.due_date) {
        dueDate = commitment.due_date
      } else {
        // Default due dates based on type
        const now = new Date()
        switch (commitment.type) {
          case 'commitment':
            now.setDate(now.getDate() + 7) // 1 week for commitments
            break
          case 'follow_up':
            now.setDate(now.getDate() + 14) // 2 weeks for follow-ups
            break
          case 'intro_request':
            now.setDate(now.getDate() + 7) // 1 week for intros
            break
          case 'deadline':
            now.setDate(now.getDate() + 3) // 3 days for deadlines without date
            break
        }
        dueDate = now.toISOString().split('T')[0]
      }

      const { error } = await (adminClient.from('reminders') as ReturnType<typeof adminClient.from>)
        .insert({
          user_id: userId,
          contact_id: contactId,
          company_id: companyId,
          memo_id: memoId,
          type: commitment.type,
          title: commitment.title.slice(0, 255),
          context: commitment.context || null,
          source_text: commitment.source_text || null,
          due_date: dueDate,
          priority: commitment.priority || 'medium',
          status: 'pending',
        } as never)

      if (error) {
        console.error(`[Reminders] Failed to create reminder:`, error)
      } else {
        createdCount++
        console.log(`[Reminders] Created: ${commitment.title}`)
      }
    } catch (err) {
      console.error(`[Reminders] Error creating reminder:`, err)
    }
  }

  return createdCount
}

/**
 * Extract action items as tasks
 */
async function extractTasks(memoContent: string): Promise<Array<{ title: string; priority: string }>> {
  const prompt = `Extract action items from this meeting memo. Return a JSON array with:
- title: Brief task description (max 100 chars)
- priority: "low", "medium", or "high"

Return ONLY a valid JSON array. If no tasks, return [].

Memo:
${memoContent}`

  try {
    const result = await callClaude(prompt)
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0])
  } catch {
    return []
  }
}

/**
 * Update job progress in the database
 */
async function updateJobProgress(
  adminClient: ReturnType<typeof createAdminClient>,
  jobId: string,
  step: string,
  progress: number,
  status: 'processing' | 'completed' | 'failed' = 'processing',
  result?: object,
  error?: string
) {
  try {
    await (adminClient.from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .update({
        status,
        current_step: step,
        progress,
        result: result || null,
        error: error || null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', jobId)
  } catch (err) {
    console.error('[Job Update Error]', err)
  }
}

/**
 * Check if a memo already exists for this source
 */
async function checkExistingMemo(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  source: string,
  sourceId: string
): Promise<string | null> {
  try {
    // Check imported_transcripts table first
    const { data: imported } = await (adminClient
      .from('imported_transcripts') as ReturnType<typeof adminClient.from>)
      .select('memo_id')
      .eq('user_id', userId)
      .eq('source', source)
      .eq('source_id', sourceId)
      .single() as { data: { memo_id: string } | null }

    if (imported?.memo_id) {
      return imported.memo_id
    }

    return null
  } catch {
    return null
  }
}

/**
 * Main processing function - converts transcript to memo
 * This is the unified entry point for all transcript processing
 */
export async function processTranscriptToMemo(input: ProcessInput): Promise<ProcessResult> {
  const adminClient = createAdminClient()
  const { source, transcriptId, transcriptContent, userId, jobId, metadata } = input

  console.log(`[Processing] Starting for user ${userId}, source: ${source}, transcriptId: ${transcriptId}, jobId: ${jobId}`)

  try {
    // IDEMPOTENCY CHECK: Check if we already processed this transcript
    if (source === 'fireflies' && transcriptId) {
      const existingMemoId = await checkExistingMemo(adminClient, userId, source, transcriptId)
      if (existingMemoId) {
        console.log(`[Processing] Already processed - memo exists: ${existingMemoId}`)
        if (jobId) {
          await updateJobProgress(adminClient, jobId, 'completed', 100, 'completed', {
            memo_id: existingMemoId,
            skipped: true,
            reason: 'Already processed',
          })
        }
        return {
          success: true,
          memoId: existingMemoId,
        }
      }
    }

    let transcript = transcriptContent || ''
    let meetingTitle = metadata?.title || 'Meeting Memo'
    let meetingDate = metadata?.date || null
    let participants: string[] = metadata?.participants || []

    // Step 1: Fetch transcript if needed
    if (source === 'fireflies' && transcriptId && !transcript) {
      if (jobId) await updateJobProgress(adminClient, jobId, 'fetching', 10)

      // Get Fireflies API key
      const { data: integration, error: integrationError } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('credentials')
        .eq('user_id', userId)
        .eq('provider', 'fireflies')
        .eq('status', 'active')
        .single() as { data: { credentials: { api_key?: string } | null } | null; error: unknown }

      if (integrationError) {
        console.error('[Processing] Integration lookup error:', integrationError)
      }

      if (!integration?.credentials?.api_key) {
        throw new Error('Fireflies API key not configured. Please add your API key in Settings.')
      }

      const ffData = await fetchFirefliesTranscript(integration.credentials.api_key, transcriptId)
      transcript = ffData.transcript
      meetingTitle = ffData.title || meetingTitle
      participants = ffData.participants || []
      // Convert Fireflies timestamp to ISO date string (YYYY-MM-DD)
      if (ffData.date) {
        try {
          meetingDate = new Date(ffData.date).toISOString().split('T')[0]
        } catch {
          console.error('[Processing] Invalid date from Fireflies:', ffData.date)
        }
      }
    }

    if (!transcript) {
      throw new Error('No transcript content available')
    }

    console.log(`[Processing] Transcript length: ${transcript.length} chars`)

    // Step 2: Detect meeting type
    if (jobId) await updateJobProgress(adminClient, jobId, 'analyzing', 25)
    console.log(`[Processing] Detecting meeting type...`)
    const meetingType = await detectMeetingType(transcript)
    console.log(`[Processing] Meeting type: ${meetingType}`)

    // Step 3: Detect company
    if (jobId) await updateJobProgress(adminClient, jobId, 'extracting', 40)
    const { data: existingCompanies } = await (adminClient
      .from('companies') as ReturnType<typeof adminClient.from>)
      .select('id, name')
      .eq('user_id', userId) as { data: Array<{ id: string; name: string }> | null }

    console.log(`[Processing] Detecting company...`)
    const companyDetection = await detectCompany(transcript, existingCompanies || [])

    let companyId: string | null = null
    let companyName: string | null = null

    if (companyDetection && companyDetection.confidence > 0.6) {
      if (companyDetection.existingId) {
        companyId = companyDetection.existingId
        companyName = companyDetection.name
        console.log(`[Processing] Matched existing company: ${companyName}`)
      } else {
        // Create new company
        const { data: newCompany, error: companyError } = await (adminClient
          .from('companies') as ReturnType<typeof adminClient.from>)
          .insert({
            user_id: userId,
            name: companyDetection.name,
            website: companyDetection.metadata.website || null,
            industry: companyDetection.metadata.industry || null,
            stage: companyDetection.metadata.stage || null,
          } as never)
          .select('id')
          .single() as { data: { id: string } | null; error: unknown }

        if (companyError) {
          console.error('[Processing] Company creation error:', companyError)
        }

        if (newCompany) {
          companyId = newCompany.id
          companyName = companyDetection.name
          console.log(`[Processing] Created new company: ${companyName}`)
        }
      }
    }

    // Step 4: Generate memo content
    if (jobId) await updateJobProgress(adminClient, jobId, 'generating', 60)
    console.log(`[Processing] Generating memo content...`)
    const memoContent = await generateMemoContent(transcript, meetingType)

    // Step 5: Generate summary
    if (jobId) await updateJobProgress(adminClient, jobId, 'summarizing', 75)
    console.log(`[Processing] Generating summary...`)
    const summary = await generateSummary(transcript)

    // Step 6: Extract tasks
    console.log(`[Processing] Extracting tasks...`)
    const tasks = await extractTasks(memoContent)

    // Step 7: Save memo - USE ONLY VERIFIED FIELDS
    if (jobId) await updateJobProgress(adminClient, jobId, 'saving', 85)

    // Get default folder (optional)
    const { data: defaultFolder } = await (adminClient
      .from('folders') as ReturnType<typeof adminClient.from>)
      .select('id')
      .eq('user_id', userId)
      .eq('is_default', true)
      .single() as { data: { id: string } | null }

    // Insert memo with ONLY fields we know exist
    const memoInsertData: Record<string, unknown> = {
      user_id: userId,
      title: meetingTitle,
      content: memoContent,
      summary: summary || null,
      source: source || 'manual',
    }

    // Add optional fields only if they have values
    if (defaultFolder?.id) {
      memoInsertData.folder_id = defaultFolder.id
    }
    if (companyId) {
      memoInsertData.company_id = companyId
    }
    if (meetingDate) {
      memoInsertData.meeting_date = meetingDate
    }

    console.log('[Processing] Inserting memo with fields:', Object.keys(memoInsertData))

    const { data: memo, error: memoError } = await (adminClient
      .from('memos') as ReturnType<typeof adminClient.from>)
      .insert(memoInsertData as never)
      .select('id')
      .single() as { data: { id: string } | null; error: { message?: string; details?: string; code?: string } | null }

    if (memoError) {
      console.error('[Processing] Memo insert error:', JSON.stringify(memoError, null, 2))
      throw new Error(`Failed to save memo: ${memoError.message || memoError.details || 'Unknown database error'}`)
    }

    if (!memo) {
      throw new Error('Memo was not created - no data returned')
    }

    console.log(`[Processing] Memo saved: ${memo.id}`)

    // Step 8: Save tasks
    if (tasks.length > 0) {
      const { error: tasksError } = await (adminClient.from('tasks') as ReturnType<typeof adminClient.from>).insert(
        tasks.map((t) => ({
          user_id: userId,
          memo_id: memo.id,
          company_id: companyId,
          title: t.title.slice(0, 255), // Ensure title fits
          priority: t.priority || 'medium',
          status: 'pending',
        })) as never
      ) as { error: unknown }

      if (tasksError) {
        console.error('[Processing] Tasks creation error:', tasksError)
        // Don't fail the whole process for task errors
      } else {
        console.log(`[Processing] Created ${tasks.length} tasks`)
      }
    }

    // Step 8.5: Extract and create contacts from participants
    let contactsCreated = 0
    const contactNameToIdMap = new Map<string, string>()
    try {
      console.log(`[Processing] Extracting contacts from transcript...`)
      const extractedContacts = await extractParticipants(transcript, participants)

      if (extractedContacts.length > 0) {
        console.log(`[Processing] Found ${extractedContacts.length} contacts to process`)
        contactsCreated = await createOrUpdateContacts(
          adminClient,
          userId,
          extractedContacts,
          memo.id,
          companyId,
          meetingDate
        )
        console.log(`[Processing] Created ${contactsCreated} new contacts`)

        // Build contact name -> ID map for reminder linking
        for (const contact of extractedContacts) {
          // Fetch the contact ID from the database
          const { data: contactData } = await (adminClient
            .from('contacts') as ReturnType<typeof adminClient.from>)
            .select('id')
            .eq('user_id', userId)
            .ilike('name', contact.name)
            .single() as { data: { id: string } | null }

          if (contactData) {
            contactNameToIdMap.set(contact.name, contactData.id)
          }
        }
      }
    } catch (contactError) {
      console.error('[Processing] Contact extraction error (non-fatal):', contactError)
    }

    // Step 8.6: Extract commitments and create reminders
    let remindersCreated = 0
    try {
      console.log(`[Processing] Extracting commitments from transcript...`)
      const commitments = await extractCommitments(transcript, memoContent)

      if (commitments.length > 0) {
        console.log(`[Processing] Found ${commitments.length} commitments to track`)
        remindersCreated = await createReminders(
          adminClient,
          userId,
          commitments,
          memo.id,
          companyId,
          contactNameToIdMap
        )
        console.log(`[Processing] Created ${remindersCreated} reminders`)
      }
    } catch (reminderError) {
      console.error('[Processing] Commitment extraction error (non-fatal):', reminderError)
    }

    // Step 9: File to Google Drive
    if (jobId) await updateJobProgress(adminClient, jobId, 'filing', 95)

    try {
      const { data: googleIntegration } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('credentials')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .eq('status', 'active')
        .single() as { data: { credentials: { access_token?: string; refresh_token?: string; drive_folder_id?: string } | null } | null }

      if (googleIntegration?.credentials?.access_token) {
        console.log(`[Processing] Filing to Google Drive... (type: ${meetingType})`)
        const driveResult = await createMemoInDrive(
          googleIntegration.credentials.access_token,
          googleIntegration.credentials.refresh_token,
          googleIntegration.credentials.drive_folder_id,
          userId,
          {
            title: meetingTitle,
            content: memoContent,
            summary,
            meetingDate,
            companyName,
            meetingType,
          }
        )

        if (driveResult) {
          await (adminClient.from('memos') as ReturnType<typeof adminClient.from>)
            .update({
              drive_file_id: driveResult.fileId,
              drive_web_view_link: driveResult.webViewLink,
            } as never)
            .eq('id', memo.id)
          console.log(`[Processing] Filed to Google Drive: ${driveResult.webViewLink}`)
        }
      }
    } catch (driveError) {
      console.error('[Processing] Drive filing error (non-fatal):', driveError)
    }

    // Step 10: Mark job as completed
    if (jobId) {
      await updateJobProgress(adminClient, jobId, 'completed', 100, 'completed', {
        memo_id: memo.id,
        company_id: companyId,
        company_name: companyName,
      })
    }

    // Mark transcript as imported (for idempotency)
    if (source === 'fireflies' && transcriptId) {
      const { error: importError } = await (adminClient
        .from('imported_transcripts') as ReturnType<typeof adminClient.from>)
        .upsert({
          user_id: userId,
          source: 'fireflies',
          source_id: transcriptId,
          memo_id: memo.id,
        } as never, { onConflict: 'user_id,source,source_id' }) as { error: unknown }

      if (importError) {
        console.error('[Processing] Import tracking error:', importError)
      }
    }

    console.log(`[Processing] Complete! Memo ID: ${memo.id}, Contacts: ${contactsCreated}, Reminders: ${remindersCreated}`)

    // Send email notification (non-blocking)
    sendEmailNotification(adminClient, userId, meetingTitle, companyName, memo.id).catch(err => {
      console.error('[Processing] Email notification error (non-fatal):', err)
    })

    // Track analytics event (non-blocking)
    trackServerEvent(userId, 'memo_synced', {
      source,
      company_name: companyName || null,
      contacts_created: contactsCreated,
      reminders_created: remindersCreated,
    }).catch(err => {
      console.error('[Processing] Analytics error (non-fatal):', err)
    })

    return {
      success: true,
      memoId: memo.id,
      companyName: companyName || undefined,
      contactsCreated,
      remindersCreated,
    }
  } catch (error) {
    console.error('[Processing] Error:', error)

    if (jobId) {
      await updateJobProgress(
        adminClient,
        jobId,
        'failed',
        0,
        'failed',
        undefined,
        error instanceof Error ? error.message : 'Processing failed'
      )
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    }
  }
}

/**
 * Send email notification for processed memo
 */
async function sendEmailNotification(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  memoTitle: string,
  companyName: string | null,
  memoId: string
) {
  try {
    // Get user's profile to check notification preferences
    const { data: profile } = await adminClient
      .from('profiles')
      .select('notification_email, email_digest_frequency')
      .eq('id', userId)
      .single() as { data: { notification_email: string | null; email_digest_frequency: string | null } | null }

    if (!profile?.notification_email) {
      console.log('[Processing] No notification email for user')
      return
    }

    // Only send if user has enabled instant notifications (not never or digest)
    // For now, we'll send for any frequency except 'never'
    if (profile.email_digest_frequency === 'never') {
      console.log('[Processing] User has email notifications disabled')
      return
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ai-vc-v2.vercel.app'
    const memoUrl = `${appUrl}/memos/${memoId}`

    const { subject, html, text } = memoProcessedEmail(memoTitle, companyName, memoUrl)

    await sendEmail({
      to: profile.notification_email,
      subject,
      html,
      text,
    })

    console.log('[Processing] Email notification sent to:', profile.notification_email)
  } catch (error) {
    console.error('[Processing] Email notification error:', error)
  }
}

// Legacy exports for backward compatibility
export interface QueuePayload {
  transcriptId?: string
  source: string
  transcriptContent?: string
  title?: string
}

export async function enqueueProcessingJob(userId: string, payload: QueuePayload) {
  const adminClient = createAdminClient()

  const { data: job, error } = await (adminClient
    .from('processing_jobs') as ReturnType<typeof adminClient.from>)
    .insert({
      user_id: userId,
      source: payload.source,
      source_id: payload.transcriptId || null,
      status: 'pending',
      current_step: null,
      progress: 0,
      metadata: {
        title: payload.title || null,
        transcript_content: payload.transcriptContent || null,
      },
    } as never)
    .select('id')
    .single() as { data: { id: string } | null; error: unknown }

  if (error || !job) {
    console.error('[Enqueue] Error:', error)
    throw new Error('Failed to create processing job')
  }

  return job.id
}

export async function processPendingJobs(limit = 3) {
  const adminClient = createAdminClient()
  const { data: pendingJobs } = await (adminClient
    .from('processing_jobs') as ReturnType<typeof adminClient.from>)
    .select('id, user_id, source, source_id, metadata')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit) as { data: Array<{ id: string; user_id: string; source: string; source_id: string | null; metadata: Record<string, unknown> | null }> | null }

  if (!pendingJobs || pendingJobs.length === 0) {
    return 0
  }

  let processedCount = 0
  for (const job of pendingJobs) {
    const result = await processTranscriptToMemo({
      source: job.source as 'fireflies' | 'granola' | 'manual',
      transcriptId: job.source_id || undefined,
      transcriptContent: job.metadata?.transcript_content as string | undefined,
      userId: job.user_id,
      jobId: job.id,
      metadata: {
        title: job.metadata?.title as string | undefined,
      },
    })
    if (result.success) {
      processedCount += 1
    }
  }

  return processedCount
}
