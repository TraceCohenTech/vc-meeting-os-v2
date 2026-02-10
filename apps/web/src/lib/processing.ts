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

interface DbResult<T> {
  data: T | null
  error: Error | null
}

/**
 * Call Groq API directly to avoid SDK header issues
 */
async function callGroq(prompt: string, systemPrompt?: string): Promise<string> {
  // Trim the API key to remove any whitespace that might cause header issues
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
  // Trim the API key to remove any whitespace
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
  const prompt = `Classify this meeting transcript into one of these categories:
- founder-pitch: A startup pitch meeting with founders
- customer-call: Customer discovery or sales call
- partner-meeting: Partnership or BD discussion
- internal: Internal team meeting
- board-meeting: Board or investor update
- due-diligence: Due diligence or reference call

Return ONLY the category ID (e.g., "founder-pitch"). If unsure, return "internal".

Transcript excerpt:
${transcript.slice(0, 2000)}`

  try {
    const result = await callGroq(prompt)
    const category = result.trim().toLowerCase().replace(/['"]/g, '')

    const validTypes = ['founder-pitch', 'customer-call', 'partner-meeting', 'internal', 'board-meeting', 'due-diligence']
    if (validTypes.includes(category)) {
      return category
    }

    // Try to find a match
    for (const type of validTypes) {
      if (category.includes(type)) {
        return type
      }
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

    // Try to parse JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.name || parsed.name === 'null') return null

    // Check for existing company match
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
  await (adminClient.from('processing_jobs') as ReturnType<typeof adminClient.from>)
    .update({
      status,
      current_step: step,
      progress,
      result: result || {},
      error: error || null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', jobId)
}

/**
 * Main processing function - converts transcript to memo
 * This is the unified entry point for all transcript processing
 */
export async function processTranscriptToMemo(input: ProcessInput): Promise<ProcessResult> {
  const adminClient = createAdminClient()
  const { source, transcriptId, transcriptContent, userId, jobId, metadata } = input

  console.log(`[Processing] Starting for user ${userId}, source: ${source}, jobId: ${jobId}`)

  try {
    let transcript = transcriptContent || ''
    let meetingTitle = metadata?.title || 'Meeting Memo'
    let meetingDate = metadata?.date || new Date().toISOString()
    let participants = metadata?.participants || []

    // Step 1: Fetch transcript if needed
    if (source === 'fireflies' && transcriptId && !transcript) {
      if (jobId) await updateJobProgress(adminClient, jobId, 'fetching', 10)

      // Get Fireflies API key
      const { data: integration } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('credentials')
        .eq('user_id', userId)
        .eq('provider', 'fireflies')
        .eq('status', 'active')
        .single() as unknown as DbResult<{ credentials: { api_key?: string } | null }>

      if (!integration?.credentials?.api_key) {
        throw new Error('Fireflies API key not configured. Please add your API key in Settings.')
      }

      const ffData = await fetchFirefliesTranscript(integration.credentials.api_key, transcriptId)
      transcript = ffData.transcript
      meetingTitle = ffData.title || meetingTitle
      meetingDate = ffData.date || meetingDate
      participants = ffData.participants
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
      .eq('user_id', userId) as unknown as { data: Array<{ id: string; name: string }> | null }

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
        const { data: newCompany } = await (adminClient
          .from('companies') as ReturnType<typeof adminClient.from>)
          .insert({
            user_id: userId,
            name: companyDetection.name,
            website: companyDetection.metadata.website || null,
            industry: companyDetection.metadata.industry || null,
            stage: companyDetection.metadata.stage || null,
          } as never)
          .select('id')
          .single() as unknown as DbResult<{ id: string }>

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

    // Step 7: Save memo
    if (jobId) await updateJobProgress(adminClient, jobId, 'saving', 85)

    // Get default folder
    const { data: defaultFolder } = await (adminClient
      .from('folders') as ReturnType<typeof adminClient.from>)
      .select('id')
      .eq('user_id', userId)
      .eq('is_default', true)
      .single() as unknown as DbResult<{ id: string }>

    const { data: memo, error: memoError } = await (adminClient
      .from('memos') as ReturnType<typeof adminClient.from>)
      .insert({
        user_id: userId,
        folder_id: defaultFolder?.id || null,
        company_id: companyId,
        source,
        source_id: transcriptId || null,
        title: meetingTitle,
        content: memoContent,
        summary,
        transcript,
        meeting_date: meetingDate,
        participants,
        meeting_type: meetingType,
        status: 'completed',
        metadata: {
          processing_completed_at: new Date().toISOString(),
        },
      } as never)
      .select('id')
      .single() as unknown as DbResult<{ id: string }>

    if (memoError || !memo) {
      throw new Error(memoError?.message || 'Failed to save memo')
    }

    console.log(`[Processing] Memo saved: ${memo.id}`)

    // Step 8: Save tasks
    if (tasks.length > 0) {
      await (adminClient.from('tasks') as ReturnType<typeof adminClient.from>).insert(
        tasks.map((t) => ({
          user_id: userId,
          memo_id: memo.id,
          company_id: companyId,
          title: t.title,
          priority: t.priority || 'medium',
          status: 'pending',
        })) as never
      )
      console.log(`[Processing] Created ${tasks.length} tasks`)
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
        .single() as unknown as DbResult<{ credentials: { access_token?: string; refresh_token?: string; drive_folder_id?: string } | null }>

      if (googleIntegration?.credentials?.access_token) {
        console.log(`[Processing] Filing to Google Drive...`)
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
      // Don't fail the whole process for Drive errors
    }

    // Step 10: Mark job as completed
    if (jobId) {
      await updateJobProgress(adminClient, jobId, 'completed', 100, 'completed', {
        memo_id: memo.id,
        company_id: companyId,
        company_name: companyName,
      })
    }

    // Mark transcript as imported
    if (source === 'fireflies' && transcriptId) {
      await (adminClient
        .from('imported_transcripts') as ReturnType<typeof adminClient.from>)
        .upsert({
          user_id: userId,
          source: 'fireflies',
          source_id: transcriptId,
          memo_id: memo.id,
        } as never, { onConflict: 'user_id,source,source_id' })
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
    .single() as unknown as DbResult<{ id: string }>

  if (error || !job) {
    throw new Error(error?.message || 'Failed to create processing job')
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
    .limit(limit) as unknown as { data: Array<{ id: string; user_id: string; source: string; source_id: string | null; metadata: Record<string, unknown> | null }> | null }

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
