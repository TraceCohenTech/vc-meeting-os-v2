import { NextRequest, NextResponse } from 'next/server'
import {
  ingestTranscript,
  verifyWebhookSignature,
  parseFirefliesPayload,
} from '@/lib/ingestion'
import { createAdminClient } from '@/lib/supabase/server'

const FIREFLIES_WEBHOOK_SECRET = process.env.FIREFLIES_WEBHOOK_SECRET

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const { webhookId } = await params
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

    const adminClient = createAdminClient()

    // Find the user by webhook ID stored in integrations
    let userId: string | null = null

    // Look up user by webhook ID in credentials
    const { data: integration } = await (adminClient
      .from('integrations') as ReturnType<typeof adminClient.from>)
      .select('user_id')
      .eq('provider', 'fireflies')
      .eq('status', 'active')
      .contains('credentials', { webhook_id: webhookId })
      .single() as unknown as { data: { user_id: string } | null }

    if (integration) {
      userId = integration.user_id
    }

    // Fallback: try clientReferenceId from payload
    if (!userId && payload.clientReferenceId) {
      userId = payload.clientReferenceId
    }

    // Fallback: use first active Fireflies integration
    if (!userId) {
      const { data: integrations } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('user_id')
        .eq('provider', 'fireflies')
        .eq('status', 'active')
        .limit(1) as unknown as { data: Array<{ user_id: string }> | null }

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
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  const challenge = request.nextUrl.searchParams.get('challenge')

  if (challenge) {
    return NextResponse.json({ challenge })
  }

  const { webhookId } = await params
  return NextResponse.json({
    status: 'Fireflies webhook endpoint active',
    webhookId,
  })
}
