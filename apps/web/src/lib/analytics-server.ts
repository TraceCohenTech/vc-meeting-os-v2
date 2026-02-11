import { createAdminClient } from '@/lib/supabase/server'

// Analytics events (same as client)
export type AnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped'
  | 'fireflies_connected'
  | 'google_drive_connected'
  | 'memo_synced'
  | 'memo_viewed'
  | 'memo_edited'
  | 'company_created'
  | 'contact_created'
  | 'feedback_submitted'
  | 'search_performed'

interface EventProperties {
  [key: string]: string | number | boolean | null
}

// Track event from server side
export async function trackServerEvent(
  userId: string,
  event: AnalyticsEvent,
  properties?: EventProperties
) {
  try {
    const adminClient = createAdminClient()

    await (adminClient.from('analytics_events') as ReturnType<typeof adminClient.from>).insert({
      user_id: userId,
      event,
      properties: properties || {},
      created_at: new Date().toISOString(),
    } as never)
  } catch (error) {
    console.error('[Analytics] Failed to track server event:', error)
  }
}
