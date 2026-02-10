import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { processTranscriptToMemo } from '@/lib/processing'

interface FirefliesPayload {
  meetingId: string
  eventType: string
  clientReferenceId?: string
  transcript?: {
    title: string
    date: string
    duration: number
    participants: string[]
  }
}

function parsePayload(body: unknown): FirefliesPayload | null {
  if (!body || typeof body !== 'object') return null
  const payload = body as Record<string, unknown>
  if (!payload.meetingId || typeof payload.meetingId !== 'string') return null

  return {
    meetingId: payload.meetingId,
    eventType: typeof payload.eventType === 'string' ? payload.eventType : '',
    clientReferenceId: typeof payload.clientReferenceId === 'string' ? payload.clientReferenceId : undefined,
    transcript: payload.transcript && typeof payload.transcript === 'object'
      ? {
          title: (payload.transcript as Record<string, unknown>).title as string || 'Meeting',
          date: (payload.transcript as Record<string, unknown>).date as string || new Date().toISOString(),
          duration: Number((payload.transcript as Record<string, unknown>).duration) || 0,
          participants: Array.isArray((payload.transcript as Record<string, unknown>).participants)
            ? (payload.transcript as Record<string, unknown>).participants as string[]
            : [],
        }
      : undefined,
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  console.log('[Fireflies Webhook] Received request')

  try {
    const rawBody = await request.text()
    const body = JSON.parse(rawBody)
    const payload = parsePayload(body)

    if (!payload) {
      console.log('[Fireflies Webhook] Invalid payload format')
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 })
    }

    console.log('[Fireflies Webhook] Event:', payload.eventType, 'Meeting:', payload.meetingId)

    // Only process transcription completed events
    if (payload.eventType !== 'Transcription completed') {
      return NextResponse.json({
        message: 'Event type not processed',
        eventType: payload.eventType,
      })
    }

    const adminClient = createAdminClient()

    // Find the user - try clientReferenceId first, then first active integration
    let userId = payload.clientReferenceId || null

    if (!userId) {
      const { data: integrations } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('user_id, credentials')
        .eq('provider', 'fireflies')
        .eq('status', 'active') as unknown as {
          data: Array<{ user_id: string; credentials: { api_key?: string } | null }> | null
        }

      if (integrations && integrations.length > 0) {
        userId = integrations[0].user_id
      }
    }

    if (!userId) {
      console.log('[Fireflies Webhook] No user found for webhook')
      return NextResponse.json({ error: 'Could not determine user for webhook' }, { status: 400 })
    }

    // Create a processing job record to track status
    const { data: job } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .insert({
        user_id: userId,
        source: 'fireflies',
        source_id: payload.meetingId,
        status: 'processing',
        current_step: 'fetching',
        progress: 10,
        metadata: {
          title: payload.transcript?.title || 'Fireflies Meeting',
          meeting_date: payload.transcript?.date,
          participants: payload.transcript?.participants || [],
          duration: payload.transcript?.duration || 0,
        },
      } as never)
      .select('id')
      .single() as unknown as { data: { id: string } | null }

    const jobId = job?.id

    try {
      // Process the transcript synchronously
      console.log('[Fireflies Webhook] Starting memo generation for job:', jobId)

      const result = await processTranscriptToMemo({
        source: 'fireflies',
        transcriptId: payload.meetingId,
        userId,
        jobId,
        metadata: {
          title: payload.transcript?.title,
          date: payload.transcript?.date,
          participants: payload.transcript?.participants,
        },
      })

      if (!result.success) {
        throw new Error(result.error || 'Processing failed')
      }

      console.log('[Fireflies Webhook] Memo created:', result.memoId, 'in', Date.now() - startTime, 'ms')

      return NextResponse.json({
        success: true,
        memoId: result.memoId,
        companyName: result.companyName,
        processingTime: Date.now() - startTime,
      })
    } catch (processError) {
      console.error('[Fireflies Webhook] Processing error:', processError)

      // Update job status to failed
      if (jobId) {
        await (adminClient
          .from('processing_jobs') as ReturnType<typeof adminClient.from>)
          .update({
            status: 'failed',
            error: processError instanceof Error ? processError.message : 'Processing failed',
          } as never)
          .eq('id', jobId)
      }

      return NextResponse.json({
        success: false,
        error: processError instanceof Error ? processError.message : 'Processing failed',
      }, { status: 500 })
    }
  } catch (error) {
    console.error('[Fireflies Webhook] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle webhook verification (GET request from Fireflies)
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get('challenge')

  if (challenge) {
    return NextResponse.json({ challenge })
  }

  return NextResponse.json({ status: 'Fireflies webhook endpoint active' })
}
