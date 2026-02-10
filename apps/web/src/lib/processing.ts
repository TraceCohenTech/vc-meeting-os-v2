import { createAdminClient } from '@/lib/supabase/server'
import { createMemoInDrive } from '@/lib/google/drive'

// Use direct fetch to Groq API to avoid @ai-sdk header issues
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

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
  error?: string
}

/**
 * Call Groq API directly to avoid SDK header issues
 */
async function callGroq(prompt: string, systemPrompt?: string): Promise<string> {
  const apiKey = (process.env.GROQ_API_KEY || '').trim()

  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured')
  }

  const messages = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  console.log('[Groq] Calling API...')

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Groq API Error]', response.status, errorText)
    throw new Error(`Groq API error: ${response.status} - ${errorText.slice(0, 200)}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''
  console.log('[Groq] Response received, length:', content.length)
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
    const result = await callGroq(prompt)
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
    const result = await callGroq(prompt)

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

  return await callGroq(prompt, systemPrompt)
}

/**
 * Generate a brief summary
 */
async function generateSummary(transcript: string): Promise<string> {
  return await callGroq(`Summarize this meeting in 2-3 sentences. Be specific about what was discussed and any key outcomes:\n\n${transcript.slice(0, 2000)}`)
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
    const result = await callGroq(prompt)
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

    console.log(`[Processing] Complete! Memo ID: ${memo.id}`)

    return {
      success: true,
      memoId: memo.id,
      companyName: companyName || undefined,
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
