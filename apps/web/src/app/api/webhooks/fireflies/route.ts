import { NextRequest, NextResponse } from 'next/server'
import {
  ingestTranscript,
  verifyWebhookSignature,
  parseFirefliesPayload,
} from '@/lib/ingestion'
import { createAdminClient } from '@/lib/supabase/server'

const FIREFLIES_WEBHOOK_SECRET = process.env.FIREFLIES_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-fireflies-signature') || ''

    // Verify webhook signature if secret is configured
    if (FIREFLIES_WEBHOOK_SECRET) {
      const isValid = verifyWebhookSignature('fireflies', rawBody, signature, FIREFLIES_WEBHOOK_SECRET)
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 401 }
        )
      }
    }

    const body = JSON.parse(rawBody)
    const payload = parseFirefliesPayload(body)

    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid payload format' },
        { status: 400 }
      )
    }

    // Only process transcription completed events
    if (payload.eventType !== 'Transcription completed') {
      return NextResponse.json({
        message: 'Event type not processed',
        eventType: payload.eventType,
      })
    }

    // Find the user associated with this webhook
    // First try the clientReferenceId which can be set as user_id
    let userId = payload.clientReferenceId || null

    // If no clientReferenceId, look up by Fireflies integration
    if (!userId) {
      // Get all users with Fireflies integrations and check their transcript ownership
      const adminClient = createAdminClient()

      // Fetch all active Fireflies integrations
      const { data: integrations } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('user_id, credentials')
        .eq('provider', 'fireflies')
        .eq('status', 'active') as unknown as {
          data: Array<{ user_id: string; credentials: { api_key?: string } | null }> | null
        }

      // Try to find which user owns this transcript
      // For now, use the first active integration
      // In production, you'd verify ownership via the Fireflies API
      if (integrations && integrations.length > 0) {
        userId = integrations[0].user_id
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Could not determine user for webhook' },
        { status: 400 }
      )
    }

    // Ingest the transcript
    const result = await ingestTranscript(
      {
        source: 'fireflies',
        transcriptId: payload.meetingId,
        metadata: {
          title: payload.transcript?.title || 'Fireflies Meeting',
          date: payload.transcript?.date,
          participants: payload.transcript?.participants,
          duration: payload.transcript?.duration,
          externalId: payload.meetingId,
        },
      },
      userId
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      message: 'Transcript queued for processing',
    })
  } catch (error) {
    console.error('Fireflies webhook error:', error)
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
