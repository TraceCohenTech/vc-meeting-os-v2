import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { detectCompanyFromTranscript } from '@/lib/company-detection'
import { detectMeetingType, getMemoTemplate, generateMemoFromTemplate } from '@/lib/templates/detection'
import { createMemoInDrive } from '@/lib/google/drive'

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})

interface DbResult<T> {
  data: T | null
  error: Error | null
}

/**
 * Fetch transcript from Fireflies API
 */
async function fetchFirefliesTranscript(
  apiKey: string,
  transcriptId: string
): Promise<{ title: string; date: string; transcript: string; participants: string[] }> {
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

  const ffTranscript = data.data.transcript
  const transcript = ffTranscript.sentences
    .map((s: { speaker_name: string; text: string }) => `${s.speaker_name}: ${s.text}`)
    .join('\n')

  const speakers = new Set(ffTranscript.sentences.map((s: { speaker_name: string }) => s.speaker_name))

  return {
    title: ffTranscript.title,
    date: ffTranscript.date,
    transcript,
    participants: Array.from(speakers) as string[],
  }
}

interface ProcessingJob {
  id: string
  user_id: string
  source: string
  source_id: string | null
  status: string
  metadata: {
    title?: string
    transcript_content?: string
    participants?: string[]
    meeting_date?: string
  } | null
}

/**
 * Direct processing endpoint - processes a job without Inngest
 * Used as fallback when Inngest is not configured
 */
export async function POST(request: NextRequest) {
  const adminClient = createAdminClient()

  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
    }

    // Get the job
    const { data: job, error: jobError } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .select('*')
      .eq('id', jobId)
      .single() as unknown as DbResult<ProcessingJob>

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.status !== 'pending') {
      return NextResponse.json({ message: 'Job already processed' })
    }

    // Update status to processing
    await updateJobProgress(adminClient, jobId, 'fetching', 10)

    const userId = job.user_id
    let transcript = job.metadata?.transcript_content || ''
    let meetingTitle = job.metadata?.title || 'Meeting Memo'
    let participants = job.metadata?.participants || []
    let meetingDate = job.metadata?.meeting_date || new Date().toISOString()

    // If source is Fireflies and we have a source_id, fetch the transcript
    if (job.source === 'fireflies' && job.source_id && !transcript) {
      try {
        // Get Fireflies API key from integrations
        const { data: integration } = await (adminClient
          .from('integrations') as ReturnType<typeof adminClient.from>)
          .select('credentials')
          .eq('user_id', userId)
          .eq('provider', 'fireflies')
          .single() as unknown as DbResult<{ credentials: { api_key?: string } | null }>

        if (!integration?.credentials?.api_key) {
          await updateJobProgress(adminClient, jobId, 'failed', 0, 'failed', undefined, 'Fireflies API key not found')
          return NextResponse.json({ error: 'Fireflies API key not found' }, { status: 400 })
        }

        const ffData = await fetchFirefliesTranscript(integration.credentials.api_key, job.source_id)
        transcript = ffData.transcript
        meetingTitle = ffData.title || meetingTitle
        meetingDate = ffData.date || meetingDate
        participants = ffData.participants
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch from Fireflies'
        await updateJobProgress(adminClient, jobId, 'failed', 0, 'failed', undefined, message)
        return NextResponse.json({ error: message }, { status: 500 })
      }
    }

    if (!transcript) {
      await updateJobProgress(adminClient, jobId, 'failed', 0, 'failed', undefined, 'No transcript content')
      return NextResponse.json({ error: 'No transcript content' }, { status: 400 })
    }

    // Detect meeting type
    await updateJobProgress(adminClient, jobId, 'analyzing', 30)
    const meetingType = await detectMeetingType(transcript)
    const template = getMemoTemplate(meetingType)

    // Detect company
    await updateJobProgress(adminClient, jobId, 'extracting', 50)
    const { data: existingCompanies } = await (adminClient
      .from('companies') as ReturnType<typeof adminClient.from>)
      .select('id, name, domain, normalized_domain')
      .eq('user_id', userId) as unknown as { data: Array<{ id: string; name: string; domain: string | null; normalized_domain: string | null }> | null }

    const detection = await detectCompanyFromTranscript(transcript, existingCompanies || [])

    let companyId: string | null = null
    let companyName: string | null = null
    let isNewCompany = false

    if (detection) {
      if (detection.existingCompanyId && detection.confidence > 0.7) {
        companyId = detection.existingCompanyId
        companyName = detection.name
      } else if (detection.confidence > 0.7 && !detection.existingCompanyId) {
        // Create new company
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
          companyId = newCompany.id
          companyName = detection.name
          isNewCompany = true
        }
      }
    }

    // Generate memo
    await updateJobProgress(adminClient, jobId, 'generating', 70)
    const memoText = await generateMemoFromTemplate(transcript, template)

    // Generate summary
    const summaryGeneration = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `Summarize this meeting in 1-2 sentences:\n\n${transcript.slice(0, 2000)}`,
    })

    // Extract tasks
    const tasksExtraction = await generateText({
      model: groq('llama-3.3-70b-versatile'),
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

    // Save memo
    await updateJobProgress(adminClient, jobId, 'saving', 90)

    // Get default folder
    const { data: defaultFolder } = await (adminClient
      .from('folders') as ReturnType<typeof adminClient.from>)
      .select('id')
      .eq('user_id', userId)
      .eq('is_default', true)
      .single() as unknown as DbResult<{ id: string }>

    // Create memo
    const { data: newMemo, error: memoError } = await (adminClient
      .from('memos') as ReturnType<typeof adminClient.from>)
      .insert({
        user_id: userId,
        folder_id: defaultFolder?.id || null,
        company_id: companyId,
        source: job.source,
        source_id: job.source_id || null,
        title: meetingTitle,
        content: memoText,
        summary: summaryGeneration.text,
        meeting_date: meetingDate,
        participants: participants,
        metadata: {
          template_id: template.id,
          meeting_type: meetingType,
        },
      } as never)
      .select('id')
      .single() as unknown as DbResult<{ id: string }>

    if (memoError || !newMemo) {
      await updateJobProgress(adminClient, jobId, 'failed', 0, 'failed', undefined, memoError?.message || 'Failed to save memo')
      return NextResponse.json({ error: 'Failed to save memo' }, { status: 500 })
    }

    // Save tasks
    if (tasks.length > 0) {
      await (adminClient.from('tasks') as ReturnType<typeof adminClient.from>).insert(
        tasks.map((t) => ({
          user_id: userId,
          memo_id: newMemo.id,
          company_id: companyId,
          title: t.title,
          priority: t.priority || 'medium',
          due_date: t.due_date || null,
          status: 'pending',
        })) as never
      )
    }

    // Try to file to Google Drive
    let driveResult: { filed: boolean; url?: string } = { filed: false }
    try {
      const { data: googleIntegration } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('credentials')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single() as unknown as DbResult<{ credentials: { access_token?: string; refresh_token?: string; drive_folder_id?: string } | null }>

      if (googleIntegration?.credentials?.access_token) {
        const driveInfo = await createMemoInDrive(
          googleIntegration.credentials.access_token,
          googleIntegration.credentials.refresh_token,
          googleIntegration.credentials.drive_folder_id,
          userId,
          {
            title: meetingTitle,
            content: memoText,
            summary: summaryGeneration.text,
            meetingDate: meetingDate,
            companyName: companyName,
          }
        )

        if (driveInfo) {
          await (adminClient.from('memos') as ReturnType<typeof adminClient.from>)
            .update({
              drive_file_id: driveInfo.fileId,
              drive_url: driveInfo.webViewLink,
            } as never)
            .eq('id', newMemo.id)

          driveResult = { filed: true, url: driveInfo.webViewLink }
        }
      }
    } catch (driveError) {
      console.error('Drive filing error:', driveError)
    }

    // Mark job as completed
    await updateJobProgress(adminClient, jobId, 'completed', 100, 'completed', {
      memo_id: newMemo.id,
      company_id: companyId,
      company_name: companyName,
      is_new_company: isNewCompany,
      template_used: template.id,
      drive_filed: driveResult.filed,
      drive_url: driveResult.url || null,
    })

    return NextResponse.json({
      success: true,
      memoId: newMemo.id,
      companyId,
      driveFiled: driveResult.filed,
    })
  } catch (error) {
    console.error('Direct processing error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    )
  }
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
