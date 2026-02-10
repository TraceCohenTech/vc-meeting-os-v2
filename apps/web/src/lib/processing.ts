import { createAdminClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})

const PROCESSING_STEPS = [
  { step: 'fetching', progress: 10 },
  { step: 'analyzing', progress: 30 },
  { step: 'extracting', progress: 50 },
  { step: 'generating', progress: 70 },
  { step: 'saving', progress: 90 },
  { step: 'completed', progress: 100 },
] as const

interface DbResult<T> {
  data: T | null
  error: Error | null
}

export interface QueuePayload {
  transcriptId?: string
  source: string
  transcriptContent?: string
  title?: string
}

interface ProcessingJobRow {
  id: string
  user_id: string
  source: string
  source_id: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  metadata: Record<string, unknown> | null
  updated_at?: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function updateIntegrationStatus(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  provider: string,
  status: 'active' | 'inactive' | 'error',
  errorMessage?: string | null
) {
  await (adminClient.from('integrations') as ReturnType<typeof adminClient.from>)
    .update({
      status,
      error_message: errorMessage || null,
      last_sync_at: status === 'active' ? new Date().toISOString() : null,
    } as never)
    .eq('user_id', userId)
    .eq('provider', provider)
}

async function fetchFirefliesTranscript(
  apiKey: string,
  transcriptId: string
): Promise<{ title: string; date: string; sentences: Array<{ speaker_name: string; text: string }> }> {
  const maxAttempts = 3
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch('https://api.fireflies.ai/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
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
        throw new Error(`Fireflies API error: ${response.status}`)
      }

      const data = await response.json()
      if (!data?.data?.transcript) {
        throw new Error('Fireflies transcript not found')
      }

      return data.data.transcript
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Fireflies fetch failed')
      if (attempt < maxAttempts) {
        await sleep(500 * attempt)
      }
    }
  }

  throw lastError || new Error('Fireflies fetch failed')
}

function parsePayload(job: ProcessingJobRow): QueuePayload {
  const metadata = job.metadata || {}
  return {
    transcriptId: job.source_id || undefined,
    source: job.source,
    transcriptContent:
      typeof metadata.transcript_content === 'string' ? metadata.transcript_content : undefined,
    title: typeof metadata.title === 'string' ? metadata.title : undefined,
  }
}

async function updateJobProgress(
  adminClient: ReturnType<typeof createAdminClient>,
  jobId: string,
  stepIndex: number,
  status: 'processing' | 'completed' | 'failed' = 'processing',
  result?: object,
  error?: string
) {
  const step = PROCESSING_STEPS[stepIndex]
  await (adminClient.from('processing_jobs') as ReturnType<typeof adminClient.from>)
    .update({
      status,
      current_step: step?.step || null,
      progress: step?.progress || 0,
      result: result || {},
      error: error || null,
    } as never)
    .eq('id', jobId)
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

async function claimJob(
  adminClient: ReturnType<typeof createAdminClient>,
  jobId: string
): Promise<boolean> {
  const { data } = await (adminClient
    .from('processing_jobs') as ReturnType<typeof adminClient.from>)
    .update({
      status: 'processing',
      current_step: 'fetching',
      progress: 10,
      error: null,
    } as never)
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('id') as unknown as { data: Array<{ id: string }> | null }

  return Boolean(data && data.length > 0)
}

async function processTranscript(
  adminClient: ReturnType<typeof createAdminClient>,
  jobId: string,
  userId: string,
  params: QueuePayload
) {
  try {
    await updateJobProgress(adminClient, jobId, 0)

    let transcript = params.transcriptContent || ''
    let meetingTitle = params.title || 'Meeting Memo'
    let meetingDate = new Date().toISOString()

    if (params.source === 'fireflies' && params.transcriptId) {
      const { data: integration } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('credentials')
        .eq('user_id', userId)
        .eq('provider', 'fireflies')
        .single() as unknown as DbResult<{ credentials: { api_key?: string } | null }>

      const creds = integration?.credentials
      if (!creds?.api_key) {
        await updateIntegrationStatus(
          adminClient,
          userId,
          'fireflies',
          'error',
          'Missing Fireflies API key'
        )
        await updateJobProgress(
          adminClient,
          jobId,
          0,
          'failed',
          {},
          'Fireflies integration missing API key'
        )
        return
      }

      try {
        const ffTranscript = await fetchFirefliesTranscript(creds.api_key, params.transcriptId)
        meetingTitle = ffTranscript.title
        meetingDate = ffTranscript.date
        transcript = ffTranscript.sentences
          .map((s) => `${s.speaker_name}: ${s.text}`)
          .join('\n')

        await updateIntegrationStatus(adminClient, userId, 'fireflies', 'active', null)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Fireflies fetch failed'
        await updateIntegrationStatus(adminClient, userId, 'fireflies', 'error', message)
        await updateJobProgress(
          adminClient,
          jobId,
          0,
          'failed',
          {},
          `Fireflies fetch failed: ${message}`
        )
        return
      }
    }

    if (!transcript) {
      await updateJobProgress(adminClient, jobId, 0, 'failed', {}, 'No transcript content')
      return
    }

    await updateJobProgress(adminClient, jobId, 1)
    await updateJobProgress(adminClient, jobId, 2)

    const companyExtraction = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `Extract company information from this meeting transcript. If this is a startup pitch or discussion about a company, extract:
- company_name: The company being discussed
- website: Company website if mentioned
- stage: Investment stage (idea, pre-seed, seed, series-a, etc.)
- industry: Company industry/sector
- founders: Array of founder names and titles

If no company is discussed, return null.

Return ONLY valid JSON, no other text.

Transcript:
${transcript.slice(0, 4000)}`,
    })

    let companyInfo: {
      company_name: string
      website?: string
      stage?: string
      industry?: string
      founders?: Array<{ name: string; title?: string }>
    } | null = null

    try {
      const parsed = JSON.parse(companyExtraction.text)
      if (parsed && parsed.company_name) {
        companyInfo = parsed
      }
    } catch {
      // Ignore malformed extraction output.
    }

    let companyId: string | null = null
    if (companyInfo) {
      const { data: existingCompany } = await (adminClient
        .from('companies') as ReturnType<typeof adminClient.from>)
        .select('id')
        .eq('user_id', userId)
        .ilike('name', companyInfo.company_name)
        .single() as unknown as DbResult<{ id: string }>

      if (existingCompany) {
        companyId = existingCompany.id
      } else {
        const { data: newCompany } = await (adminClient
          .from('companies') as ReturnType<typeof adminClient.from>)
          .insert({
            user_id: userId,
            name: companyInfo.company_name,
            website: companyInfo.website || null,
            stage: companyInfo.stage || null,
            industry: companyInfo.industry || null,
            founders: companyInfo.founders || [],
          } as never)
          .select('id')
          .single() as unknown as DbResult<{ id: string }>

        if (newCompany) {
          companyId = newCompany.id
        }
      }
    }

    await updateJobProgress(adminClient, jobId, 3)

    const memoGeneration = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      system: `You are an expert VC analyst. Generate a structured investment memo from meeting transcripts.
Format the memo with clear sections:
- Executive Summary (2-3 sentences)
- Key Discussion Points
- Product/Business Model
- Team Assessment (if applicable)
- Concerns/Risks
- Action Items
- Investment Recommendation (if applicable)

Be concise and focus on actionable insights.`,
      prompt: `Generate an investment memo from this meeting transcript:\n\n${transcript.slice(0, 6000)}`,
    })

    const summaryGeneration = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `Summarize this meeting in 1-2 sentences:\n\n${transcript.slice(0, 2000)}`,
    })

    const tasksExtraction = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `Extract action items from this meeting memo. Return a JSON array of tasks with:
- title: Brief task description
- priority: low, medium, or high
- due_date: ISO date string if mentioned, null otherwise

Return ONLY a valid JSON array, no other text. If no tasks, return [].

Memo:
${memoGeneration.text}`,
    })

    await updateJobProgress(adminClient, jobId, 4)

    const { data: defaultFolder } = await (adminClient
      .from('folders') as ReturnType<typeof adminClient.from>)
      .select('id')
      .eq('user_id', userId)
      .eq('is_default', true)
      .single() as unknown as DbResult<{ id: string }>

    let memoId: string | null = null
    if (params.transcriptId) {
      const { data: memo, error: memoError } = await (adminClient
        .from('memos') as ReturnType<typeof adminClient.from>)
        .select('id')
        .eq('user_id', userId)
        .eq('source', params.source)
        .eq('source_id', params.transcriptId)
        .maybeSingle() as unknown as DbResult<{ id: string } | null>

      if (memoError) {
        await updateJobProgress(
          adminClient,
          jobId,
          4,
          'failed',
          {},
          memoError?.message || 'Failed to save memo'
        )
        return
      }

      memoId = memo?.id || null
    }

    if (!memoId) {
      const { data: newMemo, error: newMemoError } = await (adminClient
        .from('memos') as ReturnType<typeof adminClient.from>)
        .insert({
          user_id: userId,
          folder_id: defaultFolder?.id || null,
          company_id: companyId,
          source: params.source,
          source_id: params.transcriptId || null,
          title: meetingTitle,
          content: memoGeneration.text,
          summary: summaryGeneration.text,
          meeting_date: meetingDate,
        } as never)
        .select('id')
        .single() as unknown as DbResult<{ id: string }>

      if (newMemoError || !newMemo) {
        await updateJobProgress(
          adminClient,
          jobId,
          4,
          'failed',
          {},
          newMemoError?.message || 'Failed to save memo'
        )
        return
      }

      memoId = newMemo.id
    }

    await (adminClient.from('memo_revisions') as ReturnType<typeof adminClient.from>).insert({
      memo_id: memoId,
      user_id: userId,
      title: meetingTitle,
      content: memoGeneration.text,
      summary: summaryGeneration.text,
      meeting_date: meetingDate,
      metadata: {
        source: params.source,
        source_id: params.transcriptId || null,
      },
    } as never)

    await (adminClient.from('memos') as ReturnType<typeof adminClient.from>)
      .update({
        folder_id: defaultFolder?.id || null,
        company_id: companyId,
        title: meetingTitle,
        content: memoGeneration.text,
        summary: summaryGeneration.text,
        meeting_date: meetingDate,
      } as never)
      .eq('id', memoId)

    try {
      const tasks = JSON.parse(tasksExtraction.text)
      if (Array.isArray(tasks) && tasks.length > 0) {
        const { data: existingTasks } = await (adminClient
          .from('tasks') as ReturnType<typeof adminClient.from>)
          .select('title')
          .eq('memo_id', memoId)
          .eq('user_id', userId) as unknown as { data: Array<{ title: string }> | null }

        const existingSet = new Set(
          (existingTasks || [])
            .map((t) => t.title.trim().toLowerCase())
            .filter(Boolean)
        )

        const deduped = tasks.filter((t: { title?: string }) => {
          const title = (t.title || '').trim().toLowerCase()
          return title && !existingSet.has(title)
        })

        if (deduped.length > 0) {
          await (adminClient.from('tasks') as ReturnType<typeof adminClient.from>).insert(
            deduped.map((t: { title: string; priority?: string; due_date?: string }) => ({
              user_id: userId,
              memo_id: memoId,
              company_id: companyId,
              title: t.title,
              priority: t.priority || 'medium',
              due_date: t.due_date || null,
              status: 'pending',
            })) as never
          )
        }
      }
    } catch {
      // Ignore malformed task extraction output.
    }

    await updateJobProgress(adminClient, jobId, 5, 'completed', {
      memo_id: memoId,
      company_id: companyId,
    })
  } catch (error) {
    await updateJobProgress(
      adminClient,
      jobId,
      0,
      'failed',
      {},
      error instanceof Error ? error.message : 'Processing failed'
    )
  }
}

export async function processQueuedJob(jobId: string) {
  const adminClient = createAdminClient()

  const { data: job } = await (adminClient
    .from('processing_jobs') as ReturnType<typeof adminClient.from>)
    .select('id, user_id, source, source_id, status, metadata')
    .eq('id', jobId)
    .single() as unknown as { data: ProcessingJobRow | null }

  if (!job) {
    return { processed: false, reason: 'job_not_found' }
  }

  const claimed = await claimJob(adminClient, jobId)
  if (!claimed) {
    return { processed: false, reason: 'already_claimed' }
  }

  await processTranscript(adminClient, job.id, job.user_id, parsePayload(job))
  return { processed: true }
}

export async function retryStaleProcessingJobs(staleMinutes = 15) {
  const adminClient = createAdminClient()
  const staleBefore = new Date(Date.now() - staleMinutes * 60_000).toISOString()

  const { data: staleJobs } = await (adminClient
    .from('processing_jobs') as ReturnType<typeof adminClient.from>)
    .select('id')
    .eq('status', 'processing')
    .lt('updated_at', staleBefore)
    .limit(25) as unknown as { data: Array<{ id: string }> | null }

  if (!staleJobs || staleJobs.length === 0) {
    return 0
  }

  const staleIds = staleJobs.map((j) => j.id)
  await (adminClient.from('processing_jobs') as ReturnType<typeof adminClient.from>)
    .update({
      status: 'pending',
      current_step: null,
      progress: 0,
      error: 'Retrying after stale processing timeout',
    } as never)
    .in('id', staleIds)

  return staleIds.length
}

export async function processPendingJobs(limit = 3) {
  const adminClient = createAdminClient()
  const { data: pendingJobs } = await (adminClient
    .from('processing_jobs') as ReturnType<typeof adminClient.from>)
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit) as unknown as { data: Array<{ id: string }> | null }

  if (!pendingJobs || pendingJobs.length === 0) {
    return 0
  }

  let processedCount = 0
  for (const job of pendingJobs) {
    const result = await processQueuedJob(job.id)
    if (result.processed) {
      processedCount += 1
    }
  }

  return processedCount
}
