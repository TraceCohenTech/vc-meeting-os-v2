import { NextRequest, NextResponse } from 'next/server'
import {
  ingestTranscript,
  verifyWebhookSignature,
  parseGranolaPayload,
} from '@/lib/ingestion'
import { createAdminClient } from '@/lib/supabase/server'

const GRANOLA_WEBHOOK_SECRET = process.env.GRANOLA_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-granola-signature') || ''

    // Verify webhook signature if secret is configured
    if (GRANOLA_WEBHOOK_SECRET) {
      const isValid = verifyWebhookSignature('granola', rawBody, signature, GRANOLA_WEBHOOK_SECRET)
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 401 }
        )
      }
    }

    const body = JSON.parse(rawBody)
    const payload = parseGranolaPayload(body)

    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid payload format' },
        { status: 400 }
      )
    }

    // Only process meeting.completed events
    if (payload.event !== 'meeting.completed') {
      return NextResponse.json({
        message: 'Event type not processed',
        eventType: payload.event,
      })
    }

    // Extract user email from participants or meeting metadata to find our user
    const adminClient = createAdminClient()

    // Try to find user by participant email
    let userId: string | null = null
    for (const participant of payload.transcript.participants) {
      if (participant.email) {
        const { data: profile } = await (adminClient
          .from('profiles') as ReturnType<typeof adminClient.from>)
          .select('id')
          .eq('email', participant.email)
          .single() as unknown as { data: { id: string } | null }

        if (profile) {
          userId = profile.id
          break
        }
      }
    }

    // Fallback: look up by Granola integration
    if (!userId) {
      const { data: integrations } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('user_id')
        .eq('provider', 'granola')
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
        source: 'granola',
        transcriptId: payload.meetingId,
        content: payload.transcript.content,
        metadata: {
          title: payload.transcript.title,
          date: payload.transcript.date,
          participants: payload.transcript.participants.map(p => p.name),
          duration: payload.transcript.duration,
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
    console.error('Granola webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle webhook verification
export async function GET() {
  return NextResponse.json({ status: 'Granola webhook endpoint active' })
}
