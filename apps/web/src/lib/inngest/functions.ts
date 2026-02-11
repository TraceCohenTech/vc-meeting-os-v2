import { inngest } from './client'
import { createAdminClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { detectCompanyFromTranscript } from '@/lib/company-detection'
import { detectMeetingType, getMemoTemplate, generateMemoFromTemplate } from '@/lib/templates/detection'
import { createMemoInDrive } from '@/lib/google/drive'

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface DbResult<T> {
  data: T | null
  error: Error | null
}

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
    } as never)
    .eq('id', jobId)
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
}

export const processTranscript = inngest.createFunction(
  {
    id: 'process-transcript',
    retries: 3,
    concurrency: {
      limit: 5,
    },
  },
  { event: 'transcript/received' },
  async ({ event, step }) => {
    const { jobId, userId, source, transcriptId, transcriptContent, title, metadata } = event.data
    const adminClient = createAdminClient()

    // Step 1: Fetch transcript (if needed)
    const transcriptData = await step.run('fetch-transcript', async () => {
      await updateJobProgress(adminClient, jobId, 'fetching', 10)

      let transcript = transcriptContent || ''
      let meetingTitle = title || 'Meeting Memo'
      let meetingDate = metadata?.meetingDate || new Date().toISOString()
      let participants = metadata?.participants || []

      if (source === 'fireflies' && transcriptId) {
        const { data: integration } = await (adminClient
          .from('integrations') as ReturnType<typeof adminClient.from>)
          .select('credentials')
          .eq('user_id', userId)
          .eq('provider', 'fireflies')
          .single() as unknown as DbResult<{ credentials: { api_key?: string } | null }>

        const creds = integration?.credentials
        if (!creds?.api_key) {
          await updateIntegrationStatus(adminClient, userId, 'fireflies', 'error', 'Missing Fireflies API key')
          throw new Error('Fireflies integration missing API key')
        }

        try {
          const ffTranscript = await fetchFirefliesTranscript(creds.api_key, transcriptId)
          meetingTitle = ffTranscript.title
          meetingDate = ffTranscript.date
          transcript = ffTranscript.sentences
            .map((s) => `${s.speaker_name}: ${s.text}`)
            .join('\n')

          // Extract unique speakers as participants
          const speakers = new Set(ffTranscript.sentences.map(s => s.speaker_name))
          participants = Array.from(speakers)

          await updateIntegrationStatus(adminClient, userId, 'fireflies', 'active', null)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Fireflies fetch failed'
          await updateIntegrationStatus(adminClient, userId, 'fireflies', 'error', message)
          throw new Error(`Fireflies fetch failed: ${message}`)
        }
      }

      if (!transcript) {
        throw new Error('No transcript content')
      }

      return { transcript, meetingTitle, meetingDate, participants }
    })

    // Step 2: Detect meeting type and template
    const templateInfo = await step.run('detect-template', async () => {
      await updateJobProgress(adminClient, jobId, 'analyzing', 30)

      const meetingType = await detectMeetingType(transcriptData.transcript)
      const template = getMemoTemplate(meetingType)

      return { meetingType, template }
    })

    // Step 3: Detect/create company
    const companyResult = await step.run('detect-company', async () => {
      await updateJobProgress(adminClient, jobId, 'extracting', 50)

      // Get existing companies for the user
      const { data: existingCompanies } = await (adminClient
        .from('companies') as ReturnType<typeof adminClient.from>)
        .select('id, name, domain, normalized_domain')
        .eq('user_id', userId) as unknown as { data: Array<{ id: string; name: string; domain: string | null; normalized_domain: string | null }> | null }

      const detection = await detectCompanyFromTranscript(
        transcriptData.transcript,
        existingCompanies || []
      )

      if (!detection) {
        return { companyId: null, companyName: null, isNew: false }
      }

      // High confidence match - use existing company
      if (detection.existingCompanyId && detection.confidence > 0.9) {
        return {
          companyId: detection.existingCompanyId,
          companyName: detection.name,
          isNew: false
        }
      }

      // High confidence new company - create it
      if (detection.confidence > 0.7 && !detection.existingCompanyId) {
        const { data: newCompany } = await (adminClient
          .from('companies') as ReturnType<typeof adminClient.from>)
          .insert({
            user_id: userId,
            name: detection.name,
            website: detection.metadata.website || null,
            domain: detection.metadata.domain || null,
            stage: detection.metadata.stage || null,
            industry: detection.metadata.industry || null,
            founders: detection.metadata.founders || [],
          } as never)
          .select('id')
          .single() as unknown as DbResult<{ id: string }>

        if (newCompany) {
          return { companyId: newCompany.id, companyName: detection.name, isNew: true }
        }
      }

      // Medium confidence - still link if we found a match
      if (detection.existingCompanyId && detection.confidence > 0.7) {
        return {
          companyId: detection.existingCompanyId,
          companyName: detection.name,
          isNew: false
        }
      }

      return { companyId: null, companyName: detection.name, isNew: false }
    })

    // Step 4: Generate memo using template
    const memoContent = await step.run('generate-memo', async () => {
      await updateJobProgress(adminClient, jobId, 'generating', 70)

      const memoText = await generateMemoFromTemplate(
        transcriptData.transcript,
        templateInfo.template
      )

      // Generate summary
      const summaryGeneration = await generateText({
        model: anthropic('claude-3-haiku-20240307'),
        prompt: `Summarize this meeting in 1-2 sentences:\n\n${transcriptData.transcript.slice(0, 2000)}`,
      })

      // Extract action items
      const tasksExtraction = await generateText({
        model: anthropic('claude-3-haiku-20240307'),
        prompt: `Extract action items from this meeting memo. Return a JSON array of tasks with:
- title: Brief task description
- priority: low, medium, or high
- due_date: ISO date string if mentioned, null otherwise

Return ONLY a valid JSON array, no other text. If no tasks, return [].

Memo:
${memoText}`,
      })

      let tasks: Array<{ title: string; priority?: string; due_date?: string }> = []
      try {
        tasks = JSON.parse(tasksExtraction.text)
      } catch {
        // Ignore malformed task extraction
      }

      return {
        content: memoText,
        summary: summaryGeneration.text,
        tasks,
      }
    })

    // Step 5: Save to database
    const savedMemo = await step.run('save-memo', async () => {
      await updateJobProgress(adminClient, jobId, 'saving', 90)

      // Get default folder
      const { data: defaultFolder } = await (adminClient
        .from('folders') as ReturnType<typeof adminClient.from>)
        .select('id')
        .eq('user_id', userId)
        .eq('is_default', true)
        .single() as unknown as DbResult<{ id: string }>

      // Check for existing memo (for deduplication)
      let memoId: string | null = null
      if (transcriptId) {
        const { data: existingMemo } = await (adminClient
          .from('memos') as ReturnType<typeof adminClient.from>)
          .select('id')
          .eq('user_id', userId)
          .eq('source', source)
          .eq('source_id', transcriptId)
          .maybeSingle() as unknown as DbResult<{ id: string } | null>

        memoId = existingMemo?.id || null
      }

      if (!memoId) {
        // Create new memo
        const { data: newMemo, error: memoError } = await (adminClient
          .from('memos') as ReturnType<typeof adminClient.from>)
          .insert({
            user_id: userId,
            folder_id: defaultFolder?.id || null,
            company_id: companyResult.companyId,
            source,
            source_id: transcriptId || null,
            title: transcriptData.meetingTitle,
            content: memoContent.content,
            summary: memoContent.summary,
            meeting_date: transcriptData.meetingDate,
            participants: transcriptData.participants,
            metadata: {
              template_id: templateInfo.template.id,
              meeting_type: templateInfo.meetingType,
              company_detection_confidence: companyResult.companyId ? 'high' : 'none',
            },
          } as never)
          .select('id')
          .single() as unknown as DbResult<{ id: string }>

        if (memoError || !newMemo) {
          throw new Error(memoError?.message || 'Failed to save memo')
        }

        memoId = newMemo.id
      } else {
        // Update existing memo
        await (adminClient.from('memos') as ReturnType<typeof adminClient.from>)
          .update({
            folder_id: defaultFolder?.id || null,
            company_id: companyResult.companyId,
            title: transcriptData.meetingTitle,
            content: memoContent.content,
            summary: memoContent.summary,
            meeting_date: transcriptData.meetingDate,
            participants: transcriptData.participants,
            metadata: {
              template_id: templateInfo.template.id,
              meeting_type: templateInfo.meetingType,
            },
          } as never)
          .eq('id', memoId)
      }

      // Create revision
      await (adminClient.from('memo_revisions') as ReturnType<typeof adminClient.from>).insert({
        memo_id: memoId,
        user_id: userId,
        title: transcriptData.meetingTitle,
        content: memoContent.content,
        summary: memoContent.summary,
        meeting_date: transcriptData.meetingDate,
        metadata: {
          source,
          source_id: transcriptId || null,
          template_id: templateInfo.template.id,
        },
      } as never)

      // Save tasks
      if (memoContent.tasks.length > 0) {
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

        const deduped = memoContent.tasks.filter((t) => {
          const taskTitle = (t.title || '').trim().toLowerCase()
          return taskTitle && !existingSet.has(taskTitle)
        })

        if (deduped.length > 0) {
          await (adminClient.from('tasks') as ReturnType<typeof adminClient.from>).insert(
            deduped.map((t) => ({
              user_id: userId,
              memo_id: memoId,
              company_id: companyResult.companyId,
              title: t.title,
              priority: t.priority || 'medium',
              due_date: t.due_date || null,
              status: 'pending',
            })) as never
          )
        }
      }

      return { memoId }
    })

    // Step 6: File to Google Drive (optional)
    const driveResult = await step.run('file-to-drive', async () => {
      try {
        // Check if user has Google integration with drive scope
        const { data: googleIntegration } = await (adminClient
          .from('integrations') as ReturnType<typeof adminClient.from>)
          .select('credentials')
          .eq('user_id', userId)
          .eq('provider', 'google')
          .single() as unknown as DbResult<{ credentials: { access_token?: string; refresh_token?: string; drive_folder_id?: string } | null }>

        if (!googleIntegration?.credentials?.access_token) {
          return { filed: false, reason: 'no_google_integration' }
        }

        // Get the full memo for filing
        const { data: memo } = await (adminClient
          .from('memos') as ReturnType<typeof adminClient.from>)
          .select('*')
          .eq('id', savedMemo.memoId)
          .single() as unknown as DbResult<{
            id: string
            title: string
            content: string
            summary: string | null
            meeting_date: string | null
          }>

        if (!memo) {
          return { filed: false, reason: 'memo_not_found' }
        }

        const driveInfo = await createMemoInDrive(
          googleIntegration.credentials.access_token,
          googleIntegration.credentials.refresh_token,
          googleIntegration.credentials.drive_folder_id,
          userId,
          {
            title: memo.title,
            content: memo.content,
            summary: memo.summary,
            meetingDate: memo.meeting_date,
            companyName: companyResult.companyName,
          }
        )

        if (driveInfo) {
          // Update memo with Drive info
          await (adminClient.from('memos') as ReturnType<typeof adminClient.from>)
            .update({
              drive_file_id: driveInfo.fileId,
              drive_url: driveInfo.webViewLink,
            } as never)
            .eq('id', savedMemo.memoId)

          // Update integration with folder ID if newly created
          if (driveInfo.folderId && !googleIntegration.credentials.drive_folder_id) {
            await (adminClient.from('integrations') as ReturnType<typeof adminClient.from>)
              .update({
                credentials: {
                  ...googleIntegration.credentials,
                  drive_folder_id: driveInfo.folderId,
                },
              } as never)
              .eq('user_id', userId)
              .eq('provider', 'google')
          }

          return { filed: true, fileId: driveInfo.fileId, url: driveInfo.webViewLink }
        }

        return { filed: false, reason: 'drive_create_failed' }
      } catch (error) {
        console.error('Drive filing error:', error)
        return { filed: false, reason: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })

    // Mark job as completed
    await step.run('complete-job', async () => {
      await updateJobProgress(adminClient, jobId, 'completed', 100, 'completed', {
        memo_id: savedMemo.memoId,
        company_id: companyResult.companyId,
        company_name: companyResult.companyName,
        is_new_company: companyResult.isNew,
        template_used: templateInfo.template.id,
        drive_filed: driveResult.filed,
        drive_url: driveResult.filed && 'url' in driveResult ? driveResult.url : null,
      })
    })

    return {
      memoId: savedMemo.memoId,
      companyId: companyResult.companyId,
      templateUsed: templateInfo.template.id,
      driveFiled: driveResult.filed,
    }
  }
)

// Export all functions for the Inngest route
export const functions = [processTranscript]
