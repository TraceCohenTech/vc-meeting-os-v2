// Analytics events
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

// Track analytics event from client (stores in Supabase via API)
export async function trackEvent(
  event: AnalyticsEvent,
  properties?: EventProperties
) {
  try {
    // Use dynamic import to avoid bundling server code in client
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return

    await (supabase.from('analytics_events') as ReturnType<typeof supabase.from>).insert({
      user_id: user.id,
      event,
      properties: properties || {},
      created_at: new Date().toISOString(),
    } as never)
  } catch (error) {
    // Don't throw - analytics should never break the app
    console.error('[Analytics] Failed to track event:', error)
  }
}
