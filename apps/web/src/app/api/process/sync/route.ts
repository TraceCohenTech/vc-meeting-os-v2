import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createMemoInDrive } from '@/lib/google/drive'

// Use direct fetch to Groq API
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

interface FirefliesTranscript {
  id: string
  title: string
  date: string
  sentences: Array<{
    speaker_name: string
    text: string
  }>
}

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
    throw new Error(`Groq API error: ${response.status}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function fetchFirefliesTranscript(apiKey: string, transcriptId: string): Promise<FirefliesTranscript | null> {
  const cleanApiKey = apiKey.trim()

  try {
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanApiKey}`,
      },
      body: JSON.stringify({
        query: `
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
        `,
        variables: { transcriptId },
      }),
    })

    const result = await response.json()
    if (result.errors) {
      console.error('[Fireflies] GraphQL errors:', result.errors)
      return null
    }
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

async function detectMeetingType(transcript: string): Promise<string> {
  try {
    const result = await callGroq(`Classify this meeting transcript into one of these categories:
- founder-pitch: A startup pitch meeting with founders
- customer-call: Customer discovery or sales call
- partner-meeting: Partnership or BD discussion
- internal: Internal team meeting
- board-meeting: Board or investor update
- due-diligence: Due diligence or reference call

Return ONLY the category ID. If unsure, return "internal".

Transcript excerpt:
${transcript.slice(0, 2000)}`)

    const category = result.trim().toLowerCase().replace(/['"]/g, '')
    const validTypes = ['founder-pitch', 'customer-call', 'partner-meeting', 'internal', 'board-meeting', 'due-diligence']
    return validTypes.includes(category) ? category : 'internal'
  } catch {
    return 'internal'
  }
}

async function detectCompany(
  transcript: string,
  existingCompanies: Array<{ id: string; name: string }>
): Promise<{ name: string; existingId?: string; metadata: Record<string, string> } | null> {
  try {
    const companyList = existingCompanies.length > 0
      ? `Known companies: ${existingCompanies.map(c => c.name).join(', ')}`
      : ''

    const result = await callGroq(`Extract company information from this meeting transcript.

${companyList}

Return a JSON object with:
- name: Company name (or null if not identifiable)
- isExisting: true if it matches a known company
- website: Company website if mentioned
- industry: Industry if identifiable
- stage: Funding stage (seed, series-a, etc.)

Return ONLY valid JSON.

Transcript:
${transcript.slice(0, 3000)}`)

    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.name || parsed.name === 'null') return null

    let existingId: string | undefined
    if (parsed.isExisting) {
      const match = existingCompanies.find(c => c.name.toLowerCase() === parsed.name.toLowerCase())
      if (match) existingId = match.id
    }

    return {
      name: parsed.name,
      existingId,
      metadata: {
        website: parsed.website || '',
        industry: parsed.industry || '',
        stage: parsed.stage || '',
      },
    }
  } catch {
    return null
  }
}

async function generateMemoContent(transcript: string, meetingType: string): Promise<string> {
  const templates: Record<string, string> = {
    'founder-pitch': `Generate a VC investment memo. Include:
## Executive Summary
## Company Overview
## Problem & Solution
## Market Opportunity
## Business Model
## Team
## Traction
## Investment Ask
## Key Concerns
## Next Steps`,
    'internal': `Generate a meeting summary. Include:
## Meeting Purpose
## Key Discussion Points
## Decisions Made
## Action Items
## Next Steps`,
  }

  return await callGroq(
    `${templates[meetingType] || templates['internal']}

Be concise. Extract specific numbers and facts.
If info not available, write "Not discussed."

Transcript:
${transcript.slice(0, 6000)}`,
    'You are an AI assistant for VC investors. Generate professional, structured meeting memos.'
  )
}

async function generateSummary(transcript: string): Promise<string> {
  return await callGroq(`Summarize this meeting in 2-3 sentences:\n\n${transcript.slice(0, 2000)}`)
}

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const { source, transcriptId, content, title } = await request.json()

    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log(`[Sync] Starting for user ${user.id}, source: ${source}, transcriptId: ${transcriptId}`)

    // IDEMPOTENCY CHECK: Check if already imported
    if (source === 'fireflies' && transcriptId) {
      const { data: existing } = await (adminClient
        .from('imported_transcripts') as ReturnType<typeof adminClient.from>)
        .select('memo_id')
        .eq('user_id', user.id)
        .eq('source', 'fireflies')
        .eq('source_id', transcriptId)
        .single() as { data: { memo_id: string } | null }

      if (existing?.memo_id) {
        console.log(`[Sync] Already imported: ${existing.memo_id}`)
        return NextResponse.json({
          success: true,
          memoId: existing.memo_id,
          skipped: true,
        })
      }
    }

    let transcriptContent = content
    let memoTitle = title || 'Meeting Memo'
    let meetingDate: string | null = null

    // Step 1: Get transcript content
    if (source === 'fireflies' && transcriptId) {
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
      // Convert Fireflies timestamp to ISO date string (YYYY-MM-DD)
      if (transcript.date) {
        try {
          meetingDate = new Date(transcript.date).toISOString().split('T')[0]
        } catch {
          console.error('[Sync] Invalid date from Fireflies:', transcript.date)
          meetingDate = null
        }
      }
    }

    if (!transcriptContent) {
      return NextResponse.json({ error: 'No transcript content provided' }, { status: 400 })
    }

    console.log(`[Sync] Transcript length: ${transcriptContent.length}`)

    // Step 2: Run detection in parallel for speed
    // - Meeting type detection
    // - Company detection (after fetching existing companies)
    // - Summary generation (independent of meeting type)
    const { data: existingCompanies } = await (adminClient
      .from('companies') as ReturnType<typeof adminClient.from>)
      .select('id, name')
      .eq('user_id', user.id) as { data: Array<{ id: string; name: string }> | null }

    console.log(`[Sync] Running parallel detection...`)
    const [meetingType, companyDetection, summary] = await Promise.all([
      detectMeetingType(transcriptContent),
      detectCompany(transcriptContent, existingCompanies || []),
      generateSummary(transcriptContent),
    ])
    console.log(`[Sync] Meeting type: ${meetingType}`)

    // Step 3: Handle company (create if needed)
    let companyId: string | null = null
    let companyName: string | null = null

    if (companyDetection) {
      if (companyDetection.existingId) {
        companyId = companyDetection.existingId
        companyName = companyDetection.name
        console.log(`[Sync] Matched company: ${companyName}`)
      } else {
        // Create new company
        const { data: newCompany, error: companyError } = await (adminClient
          .from('companies') as ReturnType<typeof adminClient.from>)
          .insert({
            user_id: user.id,
            name: companyDetection.name,
            website: companyDetection.metadata.website || null,
            industry: companyDetection.metadata.industry || null,
            stage: companyDetection.metadata.stage || null,
          } as never)
          .select('id')
          .single() as { data: { id: string } | null; error: unknown }

        if (companyError) {
          console.error('[Sync] Company creation error:', companyError)
        }

        if (newCompany) {
          companyId = newCompany.id
          companyName = companyDetection.name
          console.log(`[Sync] Created company: ${companyName}`)
        }
      }
    }

    // Step 4: Generate memo content (needs meeting type)
    console.log(`[Sync] Generating memo...`)
    const memoContent = await generateMemoContent(transcriptContent, meetingType)

    // Step 5: Get default folder
    const { data: defaultFolder } = await supabase
      .from('folders')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single()

    // Step 6: Save memo - ONLY VERIFIED FIELDS
    const memoInsertData: Record<string, unknown> = {
      user_id: user.id,
      title: memoTitle,
      content: memoContent,
      summary: summary || null,
      source: source || 'manual',
    }

    if (defaultFolder && (defaultFolder as { id: string }).id) {
      memoInsertData.folder_id = (defaultFolder as { id: string }).id
    }
    if (companyId) {
      memoInsertData.company_id = companyId
    }
    if (meetingDate) {
      memoInsertData.meeting_date = meetingDate
    }

    console.log('[Sync] Inserting memo with fields:', Object.keys(memoInsertData))

    const { data: memo, error: memoError } = await (supabase
      .from('memos') as ReturnType<typeof supabase.from>)
      .insert(memoInsertData as never)
      .select('id, title')
      .single() as { data: { id: string; title: string } | null; error: { message?: string; details?: string; code?: string } | null }

    if (memoError) {
      console.error('[Sync] Memo insert error:', JSON.stringify(memoError, null, 2))
      return NextResponse.json({
        error: `Failed to save memo: ${memoError.message || memoError.details || 'Database error'}`,
        details: memoError,
      }, { status: 500 })
    }

    if (!memo) {
      return NextResponse.json({ error: 'Memo was not created' }, { status: 500 })
    }

    console.log(`[Sync] Memo saved: ${memo.id}`)

    // Step 7: Create Drive doc if Google is connected
    let driveWebViewLink: string | null = null

    try {
      const { data: googleIntegration } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('credentials')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .eq('status', 'active')
        .single() as { data: { credentials: { access_token: string; refresh_token?: string; drive_folder_id?: string } } | null }

      if (googleIntegration?.credentials?.access_token) {
        console.log(`[Sync] Filing to Google Drive... (type: ${meetingType})`)
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
            meetingType,
          }
        )

        if (driveResult) {
          driveWebViewLink = driveResult.webViewLink

          await (supabase
            .from('memos') as ReturnType<typeof supabase.from>)
            .update({
              drive_file_id: driveResult.fileId,
              drive_web_view_link: driveResult.webViewLink,
            } as never)
            .eq('id', memo.id)

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

          console.log(`[Sync] Filed to Drive: ${driveResult.webViewLink}`)
        }
      }
    } catch (driveError) {
      console.error('[Sync] Drive error (non-fatal):', driveError)
    }

    // Step 8: Mark transcript as imported
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

    console.log(`[Sync] Complete in ${Date.now() - startTime}ms`)

    return NextResponse.json({
      success: true,
      memoId: memo.id,
      memoTitle: memo.title,
      memoContent: memoContent,
      memoSummary: summary,
      companyName,
      driveWebViewLink,
      processingTime: Date.now() - startTime,
    })
  } catch (error) {
    console.error('[Sync] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    )
  }
}
