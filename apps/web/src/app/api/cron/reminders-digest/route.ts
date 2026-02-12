import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail, remindersDigestEmail } from '@/lib/email'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * POST /api/cron/reminders-digest
 * Sends daily reminder digest emails to users who have enabled it
 * This should be called by a cron job (Vercel Cron or similar) daily at 8 AM
 */
export async function POST(request: Request) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ai-vc-v2.vercel.app'

  console.log('[Reminders Digest] Starting daily digest job...')

  try {
    // Get all users who have daily digest enabled
    const { data: profiles, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, display_name, email, notification_email, digest_frequency')
      .eq('digest_frequency', 'daily') as {
        data: Array<{
          id: string
          display_name: string | null
          email: string | null
          notification_email: string | null
          digest_frequency: string | null
        }> | null
        error: Error | null
      }

    if (profilesError) {
      console.error('[Reminders Digest] Failed to fetch profiles:', profilesError)
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 })
    }

    if (!profiles || profiles.length === 0) {
      console.log('[Reminders Digest] No users with daily digest enabled')
      return NextResponse.json({ success: true, sent: 0, message: 'No users with daily digest enabled' })
    }

    console.log(`[Reminders Digest] Found ${profiles.length} users with daily digest enabled`)

    let sentCount = 0
    let errorCount = 0

    for (const profile of profiles) {
      const email = profile.notification_email || profile.email
      if (!email) {
        console.log(`[Reminders Digest] User ${profile.id} has no email, skipping`)
        continue
      }

      // Get pending reminders for this user
      const { data: reminders, error: remindersError } = await adminClient
        .from('reminders')
        .select(`
          id,
          type,
          title,
          context,
          due_date,
          priority,
          contact_id,
          company_id,
          contacts (name),
          companies (name)
        `)
        .eq('user_id', profile.id)
        .eq('status', 'pending')
        .or('snoozed_until.is.null,snoozed_until.lte.now()')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(10) as {
          data: Array<{
            id: string
            type: string
            title: string
            context: string | null
            due_date: string | null
            priority: string
            contact_id: string | null
            company_id: string | null
            contacts: { name: string } | null
            companies: { name: string } | null
          }> | null
          error: Error | null
        }

      if (remindersError) {
        console.error(`[Reminders Digest] Failed to fetch reminders for user ${profile.id}:`, remindersError)
        errorCount++
        continue
      }

      if (!reminders || reminders.length === 0) {
        console.log(`[Reminders Digest] User ${profile.id} has no pending reminders, skipping`)
        continue
      }

      // Format reminders for email
      const formattedReminders = reminders.map(r => ({
        id: r.id,
        title: r.title,
        type: r.type,
        context: r.context || undefined,
        due_date: r.due_date || undefined,
        contact_name: r.contacts?.name,
        company_name: r.companies?.name,
        is_overdue: r.due_date ? new Date(r.due_date) < new Date() : false,
      }))

      const userName = profile.display_name || email.split('@')[0]
      const { subject, html, text } = remindersDigestEmail(
        userName,
        formattedReminders,
        `${appUrl}/reminders`
      )

      const sent = await sendEmail({ to: email, subject, html, text })

      if (sent) {
        sentCount++
        console.log(`[Reminders Digest] Sent digest to ${email} (${formattedReminders.length} reminders)`)
      } else {
        errorCount++
        console.error(`[Reminders Digest] Failed to send to ${email}`)
      }
    }

    console.log(`[Reminders Digest] Job complete. Sent: ${sentCount}, Errors: ${errorCount}`)

    return NextResponse.json({
      success: true,
      sent: sentCount,
      errors: errorCount,
      total_users: profiles.length,
    })
  } catch (error) {
    console.error('[Reminders Digest] Job error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Digest job failed' },
      { status: 500 }
    )
  }
}

// Also allow GET for easy testing/triggering
export async function GET(request: Request) {
  return POST(request)
}
