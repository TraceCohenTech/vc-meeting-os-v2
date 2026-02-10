import { NextRequest, NextResponse } from 'next/server'
import { ingestTranscript } from '@/lib/ingestion'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Google Calendar Push Notification Webhook
 *
 * This endpoint receives push notifications from Google Calendar when events change.
 * It processes meeting recordings and transcripts from Google Meet.
 *
 * Setup requires:
 * 1. Enable Google Calendar API
 * 2. Set up push notification channel via Calendar API
 * 3. Configure this endpoint as the notification URL
 */

export async function POST(request: NextRequest) {
  try {
    // Google sends various headers for identification
    const channelId = request.headers.get('x-goog-channel-id')
    const resourceState = request.headers.get('x-goog-resource-state')
    const channelToken = request.headers.get('x-goog-channel-token')

    // Validate this is a legitimate Google notification
    if (!channelId || !resourceState) {
      return NextResponse.json(
        { error: 'Invalid Google notification headers' },
        { status: 400 }
      )
    }

    // Handle sync message (sent when channel is first created)
    if (resourceState === 'sync') {
      return NextResponse.json({ status: 'Sync acknowledged' })
    }

    // Only process 'exists' or 'update' events
    if (resourceState !== 'exists' && resourceState !== 'update') {
      return NextResponse.json({
        message: 'Resource state not processed',
        resourceState,
      })
    }

    const adminClient = createAdminClient()

    // Find the user by channel token (we store user_id as token when creating the channel)
    let userId: string | null = channelToken || null

    if (!userId) {
      // Try to find by channel_id in integrations
      const { data: integration } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('user_id')
        .eq('provider', 'google')
        .eq('credentials->calendar_channel_id', channelId)
        .single() as unknown as { data: { user_id: string } | null }

      if (integration) {
        userId = integration.user_id
      }
    }

    if (!userId) {
      console.error('Google Calendar webhook: Could not find user for channel:', channelId)
      return NextResponse.json(
        { error: 'Could not determine user for notification' },
        { status: 400 }
      )
    }

    // Get the user's Google credentials to fetch event details
    const { data: integration } = await (adminClient
      .from('integrations') as ReturnType<typeof adminClient.from>)
      .select('credentials')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single() as unknown as {
        data: {
          credentials: {
            access_token?: string
            refresh_token?: string
            calendar_id?: string
          } | null
        } | null
      }

    if (!integration?.credentials?.access_token) {
      return NextResponse.json(
        { error: 'User has no valid Google credentials' },
        { status: 400 }
      )
    }

    // Fetch the calendar event that changed
    const calendarId = integration.credentials.calendar_id || 'primary'
    const eventResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
      new URLSearchParams({
        maxResults: '10',
        orderBy: 'updated',
        showDeleted: 'false',
        singleEvents: 'true',
        timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
      }),
      {
        headers: {
          Authorization: `Bearer ${integration.credentials.access_token}`,
        },
      }
    )

    if (!eventResponse.ok) {
      console.error('Failed to fetch calendar events:', eventResponse.status)
      return NextResponse.json(
        { error: 'Failed to fetch calendar events' },
        { status: 500 }
      )
    }

    const eventsData = await eventResponse.json()
    const events = eventsData.items || []

    // Filter for recently ended Google Meet events
    const now = new Date()
    const meetEvents = events.filter((event: {
      conferenceData?: { conferenceSolution?: { name?: string } }
      end?: { dateTime?: string }
      status?: string
    }) => {
      // Has Google Meet attached
      if (!event.conferenceData?.conferenceSolution?.name?.includes('Google Meet')) {
        return false
      }

      // Meeting has ended
      const endTime = event.end?.dateTime ? new Date(event.end.dateTime) : null
      if (!endTime || endTime > now) {
        return false
      }

      // Meeting ended within last 2 hours
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      if (endTime < twoHoursAgo) {
        return false
      }

      return event.status === 'confirmed'
    })

    // Process each completed meeting
    let processedCount = 0
    for (const event of meetEvents) {
      // Check if we've already processed this event
      const { data: existingMemo } = await (adminClient
        .from('memos') as ReturnType<typeof adminClient.from>)
        .select('id')
        .eq('user_id', userId)
        .eq('source', 'google_meet')
        .eq('source_id', event.id)
        .maybeSingle() as unknown as { data: { id: string } | null }

      if (existingMemo) {
        continue // Already processed
      }

      // Extract meeting info
      const attendees = (event.attendees || []).map((a: { email?: string; displayName?: string }) => ({
        email: a.email || '',
        displayName: a.displayName,
      }))

      const startTime = event.start?.dateTime ? new Date(event.start.dateTime) : now
      const endTime = event.end?.dateTime ? new Date(event.end.dateTime) : now
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000)

      // Ingest the meeting info
      const result = await ingestTranscript(
        {
          source: 'google_meet',
          transcriptId: event.id,
          metadata: {
            title: event.summary || 'Google Meet',
            date: startTime.toISOString(),
            participants: attendees.map((a: { displayName?: string; email: string }) => a.displayName || a.email),
            duration: durationMinutes,
            externalId: event.id,
          },
        },
        userId
      )

      if (result.success) {
        processedCount++
      }
    }

    return NextResponse.json({
      success: true,
      processed: processedCount,
      message: `Processed ${processedCount} meeting(s)`,
    })
  } catch (error) {
    console.error('Google Calendar webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle webhook verification
export async function GET() {
  return NextResponse.json({ status: 'Google Calendar webhook endpoint active' })
}
