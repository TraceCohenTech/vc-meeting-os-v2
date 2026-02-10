import { createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Dynamically import inngest to handle cases where it's not configured
async function sendInngestEvent(eventData: {
  name: string
  data: Record<string, unknown>
}): Promise<boolean> {
  // Check if Inngest is configured
  if (!process.env.INNGEST_EVENT_KEY) {
    console.log('Inngest not configured, skipping event send')
    return false
  }

  try {
    const { inngest } = await import('@/lib/inngest/client')
    await inngest.send(eventData)
    return true
  } catch (error) {
    console.error('Failed to send Inngest event:', error)
    return false
  }
}

export type TranscriptSource = 'fireflies' | 'granola' | 'google_meet' | 'manual' | 'file'

export interface TranscriptIngestion {
  source: TranscriptSource
  transcriptId?: string
  content?: string
  metadata: {
    title: string
    date?: string
    participants?: string[]
    duration?: number
    externalId?: string
  }
}

export interface IngestionResult {
  success: boolean
  jobId?: string
  error?: string
}

/**
 * Unified transcript ingestion handler.
 * Creates a processing job and sends an Inngest event to process the transcript.
 */
export async function ingestTranscript(
  data: TranscriptIngestion,
  userId: string
): Promise<IngestionResult> {
  const adminClient = createAdminClient()

  try {
    // Create processing job record
    const { data: job, error: jobError } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .insert({
        user_id: userId,
        source: data.source,
        source_id: data.transcriptId || null,
        status: 'pending',
        current_step: null,
        progress: 0,
        metadata: {
          title: data.metadata.title,
          transcript_content: data.content || null,
          participants: data.metadata.participants || [],
          duration: data.metadata.duration || null,
          meeting_date: data.metadata.date || null,
          external_id: data.metadata.externalId || null,
        },
      } as never)
      .select('id')
      .single() as unknown as { data: { id: string } | null; error: Error | null }

    if (jobError || !job) {
      return {
        success: false,
        error: jobError?.message || 'Failed to create processing job',
      }
    }

    // Try to send Inngest event, fall back to direct processing if not configured
    const inngestSent = await sendInngestEvent({
      name: 'transcript/received',
      data: {
        jobId: job.id,
        userId,
        source: data.source,
        transcriptId: data.transcriptId,
        transcriptContent: data.content,
        title: data.metadata.title,
        metadata: {
          participants: data.metadata.participants,
          duration: data.metadata.duration,
          meetingDate: data.metadata.date,
        },
      },
    })

    // If Inngest isn't configured, trigger direct processing via API
    if (!inngestSent) {
      // Use fetch to call the cron endpoint for this specific job
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      if (baseUrl) {
        const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`
        // Fire and forget - don't wait for processing to complete
        fetch(`${url}/api/process/direct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id }),
        }).catch(err => console.error('Direct processing trigger failed:', err))
      }
    }

    return {
      success: true,
      jobId: job.id,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ingestion failed',
    }
  }
}

/**
 * Verify webhook signature from various providers
 */
export function verifyWebhookSignature(
  provider: TranscriptSource,
  payload: string,
  signature: string,
  secret: string
): boolean {
  switch (provider) {
    case 'fireflies': {
      // Fireflies uses HMAC-SHA256
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    }
    case 'granola': {
      // Granola uses HMAC-SHA256 with 'sha256=' prefix
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    }
    case 'google_meet': {
      // Google Calendar uses webhook verification differently
      // The signature verification depends on the setup
      return true // Placeholder - implement based on actual Google webhook setup
    }
    default:
      return false
  }
}

/**
 * Parse Fireflies webhook payload
 */
export interface FirefliesWebhookPayload {
  meetingId: string
  eventType: 'Transcription completed' | string
  clientReferenceId?: string
  transcript?: {
    title: string
    date: string
    duration: number
    participants: string[]
  }
}

export function parseFirefliesPayload(body: unknown): FirefliesWebhookPayload | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  const payload = body as Record<string, unknown>

  if (!payload.meetingId || typeof payload.meetingId !== 'string') {
    return null
  }

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

/**
 * Parse Granola webhook payload
 */
export interface GranolaWebhookPayload {
  event: 'meeting.completed' | string
  meetingId: string
  transcript: {
    title: string
    content: string
    date: string
    participants: Array<{ name: string; email?: string }>
    duration: number
  }
}

export function parseGranolaPayload(body: unknown): GranolaWebhookPayload | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  const payload = body as Record<string, unknown>

  if (!payload.event || !payload.meetingId || !payload.transcript) {
    return null
  }

  const transcript = payload.transcript as Record<string, unknown>

  return {
    event: payload.event as string,
    meetingId: payload.meetingId as string,
    transcript: {
      title: transcript.title as string || 'Meeting',
      content: transcript.content as string || '',
      date: transcript.date as string || new Date().toISOString(),
      participants: Array.isArray(transcript.participants)
        ? transcript.participants.map((p: unknown) => {
            if (typeof p === 'string') return { name: p }
            if (typeof p === 'object' && p !== null) {
              const participant = p as Record<string, unknown>
              return {
                name: participant.name as string || 'Unknown',
                email: participant.email as string | undefined,
              }
            }
            return { name: 'Unknown' }
          })
        : [],
      duration: Number(transcript.duration) || 0,
    },
  }
}

/**
 * Parse Google Calendar/Meet webhook payload
 */
export interface GoogleMeetWebhookPayload {
  eventId: string
  calendarId: string
  meetingCode?: string
  recordingUrl?: string
  transcriptUrl?: string
  title: string
  startTime: string
  endTime: string
  attendees: Array<{ email: string; displayName?: string }>
}

export function parseGoogleMeetPayload(body: unknown): GoogleMeetWebhookPayload | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  const payload = body as Record<string, unknown>

  if (!payload.eventId || !payload.calendarId) {
    return null
  }

  return {
    eventId: payload.eventId as string,
    calendarId: payload.calendarId as string,
    meetingCode: payload.meetingCode as string | undefined,
    recordingUrl: payload.recordingUrl as string | undefined,
    transcriptUrl: payload.transcriptUrl as string | undefined,
    title: payload.title as string || 'Meeting',
    startTime: payload.startTime as string || new Date().toISOString(),
    endTime: payload.endTime as string || new Date().toISOString(),
    attendees: Array.isArray(payload.attendees)
      ? payload.attendees.map((a: unknown) => {
          if (typeof a === 'object' && a !== null) {
            const attendee = a as Record<string, unknown>
            return {
              email: attendee.email as string || '',
              displayName: attendee.displayName as string | undefined,
            }
          }
          return { email: '' }
        }).filter(a => a.email)
      : [],
  }
}

/**
 * Find user ID from integration or webhook configuration
 */
export async function findUserFromWebhook(
  provider: TranscriptSource,
  webhookId?: string,
  externalUserId?: string
): Promise<string | null> {
  const adminClient = createAdminClient()

  // Try to find by webhook configuration
  if (webhookId) {
    const { data } = await (adminClient
      .from('integrations') as ReturnType<typeof adminClient.from>)
      .select('user_id')
      .eq('provider', provider)
      .eq('credentials->webhook_id', webhookId)
      .single() as unknown as { data: { user_id: string } | null }

    if (data) {
      return data.user_id
    }
  }

  // Try to find by external user ID in credentials
  if (externalUserId) {
    const { data } = await (adminClient
      .from('integrations') as ReturnType<typeof adminClient.from>)
      .select('user_id')
      .eq('provider', provider)
      .eq('credentials->external_user_id', externalUserId)
      .single() as unknown as { data: { user_id: string } | null }

    if (data) {
      return data.user_id
    }
  }

  return null
}
