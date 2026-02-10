import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { detectMeetingType, getMemoTemplate, generateMemoFromTemplate, generateQuickSummary } from '@/lib/templates/detection'
import { detectCompanyFromTranscript } from '@/lib/company-detection'
import { createMemoInDrive } from '@/lib/google/drive'

interface FirefliesTranscript {
  id: string
  title: string
  date: string
  sentences: Array<{
    speaker_name: string
    text: string
  }>
}

async function fetchFirefliesTranscript(apiKey: string, transcriptId: string): Promise<FirefliesTranscript | null> {
  const query = `
    query Transcript($transcriptId: String!) {
      transcript(id: $transcriptId) {
        id
        title
        date
        sentences {
          speaker_name
          text
        }
      }
    }
  `

  try {
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        variables: { transcriptId },
      }),
    })

    const result = await response.json()
    return result.data?.transcript || null
  } catch (error) {
    console.error('Failed to fetch Fireflies transcript:', error)
    return null
  }
}

function formatTranscript(sentences: Array<{ speaker_name: string; text: string }>): string {
  return sentences
    .map(s => `${s.speaker_name}: ${s.text}`)
    .join('\n')
}

export async function POST(request: Request) {
  try {
    const { source, transcriptId, content, title } = await request.json()

    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let transcriptContent = content
    let memoTitle = title || 'Meeting Memo'
    let meetingDate: string | null = null

    // Step 1: Get transcript content
    if (source === 'fireflies' && transcriptId) {
      // Get Fireflies API key from integrations
      const { data: integration } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('credentials')
        .eq('user_id', user.id)
        .eq('provider', 'fireflies')
        .eq('status', 'active')
        .single() as { data: { credentials: { api_key: string } } | null }

      if (!integration?.credentials?.api_key) {
        return NextResponse.json({ error: 'Fireflies not connected' }, { status: 400 })
      }

      const transcript = await fetchFirefliesTranscript(integration.credentials.api_key, transcriptId)
      if (!transcript) {
        return NextResponse.json({ error: 'Failed to fetch transcript' }, { status: 500 })
      }

      transcriptContent = formatTranscript(transcript.sentences)
      memoTitle = transcript.title || memoTitle
      meetingDate = transcript.date
    }

    if (!transcriptContent) {
      return NextResponse.json({ error: 'No transcript content provided' }, { status: 400 })
    }

    // Step 2: Detect meeting type and get template
    const meetingType = await detectMeetingType(transcriptContent)
    const template = getMemoTemplate(meetingType)

    // Step 3: Detect company from transcript
    const { data: existingCompanies } = await (adminClient
      .from('companies') as ReturnType<typeof adminClient.from>)
      .select('id, name, domain, normalized_domain')
      .eq('user_id', user.id) as { data: Array<{ id: string; name: string; domain: string | null; normalized_domain: string | null }> | null }

    const companyDetection = await detectCompanyFromTranscript(
      transcriptContent,
      existingCompanies || []
    )

    // Step 4: Get or create company
    let companyId: string | null = null
    let companyName: string | null = null

    if (companyDetection && companyDetection.confidence > 0.6) {
      if (companyDetection.existingCompanyId) {
        companyId = companyDetection.existingCompanyId
        companyName = companyDetection.name
      } else {
        // Create new company
        const { data: newCompany } = await (adminClient
          .from('companies') as ReturnType<typeof adminClient.from>)
          .insert({
            user_id: user.id,
            name: companyDetection.name,
            domain: companyDetection.metadata.domain || null,
            normalized_domain: companyDetection.metadata.domain?.toLowerCase() || null,
            stage: companyDetection.metadata.stage || null,
            industry: companyDetection.metadata.industry || null,
          } as never)
          .select('id')
          .single() as { data: { id: string } | null }

        if (newCompany) {
          companyId = newCompany.id
          companyName = companyDetection.name
        }
      }
    }

    // Step 5: Generate memo content using template
    const memoContent = await generateMemoFromTemplate(transcriptContent, template)
    const summary = await generateQuickSummary(transcriptContent)

    // Step 6: Get default folder
    const { data: defaultFolder } = await supabase
      .from('folders')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single()

    // Step 7: Save memo to database
    const { data: memo, error: memoError } = await (supabase
      .from('memos') as ReturnType<typeof supabase.from>)
      .insert({
        user_id: user.id,
        folder_id: (defaultFolder as { id: string } | null)?.id || null,
        company_id: companyId,
        source: source || 'manual',
        source_id: transcriptId || null,
        title: memoTitle,
        content: memoContent,
        summary,
        meeting_date: meetingDate,
        meeting_type: meetingType,
        template_id: template.id,
        transcript: transcriptContent,
      } as never)
      .select('id, title')
      .single() as { data: { id: string; title: string } | null; error: Error | null }

    if (memoError || !memo) {
      console.error('Failed to save memo:', memoError)
      return NextResponse.json({ error: 'Failed to save memo' }, { status: 500 })
    }

    // Step 8: Create Drive doc if Google is connected
    let driveFileId: string | null = null
    let driveWebViewLink: string | null = null

    const { data: googleIntegration } = await (adminClient
      .from('integrations') as ReturnType<typeof adminClient.from>)
      .select('credentials')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .eq('status', 'active')
      .single() as { data: { credentials: { access_token: string; refresh_token?: string; drive_folder_id?: string } } | null }

    if (googleIntegration?.credentials?.access_token) {
      try {
        const driveResult = await createMemoInDrive(
          googleIntegration.credentials.access_token,
          googleIntegration.credentials.refresh_token,
          googleIntegration.credentials.drive_folder_id,
          user.id,
          {
            title: memoTitle,
            content: memoContent,
            summary,
            meetingDate,
            companyName,
          }
        )

        if (driveResult) {
          driveFileId = driveResult.fileId
          driveWebViewLink = driveResult.webViewLink

          // Update memo with Drive info
          await (supabase
            .from('memos') as ReturnType<typeof supabase.from>)
            .update({
              drive_file_id: driveFileId,
              drive_web_view_link: driveWebViewLink,
            } as never)
            .eq('id', memo.id)

          // Update integration with folder ID if new
          if (driveResult.folderId !== googleIntegration.credentials.drive_folder_id) {
            await (adminClient
              .from('integrations') as ReturnType<typeof adminClient.from>)
              .update({
                credentials: {
                  ...googleIntegration.credentials,
                  drive_folder_id: driveResult.folderId,
                },
              } as never)
              .eq('user_id', user.id)
              .eq('provider', 'google')
          }
        }
      } catch (error) {
        console.error('Failed to create Drive doc:', error)
        // Don't fail the whole request, memo is saved
      }
    }

    // Mark the fireflies transcript as imported if applicable
    if (source === 'fireflies' && transcriptId) {
      await (adminClient
        .from('imported_transcripts') as ReturnType<typeof adminClient.from>)
        .upsert({
          user_id: user.id,
          source: 'fireflies',
          source_id: transcriptId,
          memo_id: memo.id,
        } as never, { onConflict: 'user_id,source,source_id' })
    }

    return NextResponse.json({
      success: true,
      memoId: memo.id,
      memoTitle: memo.title,
      companyName,
      driveWebViewLink,
    })
  } catch (error) {
    console.error('Sync process error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    )
  }
}
