import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const STALE_DAYS_THRESHOLD = 30 // User preference: 30 days

/**
 * GET /api/reminders/stale
 * Get contacts with stale relationships (not met in X days)
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - STALE_DAYS_THRESHOLD)

    // Get contacts with stale relationships
    // A contact is "stale" if we've met them before but not recently
    const { data: staleContacts, error } = await adminClient
      .from('contacts')
      .select(`
        id,
        name,
        email,
        title,
        company_id,
        last_met_date,
        created_at,
        companies (id, name)
      `)
      .eq('user_id', user.id)
      .or(`last_met_date.lt.${cutoffDate.toISOString()},last_met_date.is.null`)
      .order('last_met_date', { ascending: true, nullsFirst: true })
      .limit(50) as {
        data: Array<{
          id: string
          name: string
          email: string | null
          title: string | null
          company_id: string | null
          last_met_date: string | null
          created_at: string
          companies: { id: string; name: string } | null
        }> | null
        error: Error | null
      }

    if (error) {
      console.error('[Stale Contacts] Fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch stale contacts' }, { status: 500 })
    }

    // Filter to only include contacts we've actually met (have contact_memos)
    const contactsWithMeetings = []
    for (const contact of staleContacts || []) {
      const { count } = await adminClient
        .from('contact_memos')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', contact.id)

      if (count && count > 0) {
        const daysSinceContact = contact.last_met_date
          ? Math.floor((new Date().getTime() - new Date(contact.last_met_date).getTime()) / (1000 * 60 * 60 * 24))
          : Math.floor((new Date().getTime() - new Date(contact.created_at).getTime()) / (1000 * 60 * 60 * 24))

        contactsWithMeetings.push({
          ...contact,
          meeting_count: count,
          days_since_contact: daysSinceContact,
        })
      }
    }

    return NextResponse.json({
      contacts: contactsWithMeetings,
      count: contactsWithMeetings.length,
      threshold_days: STALE_DAYS_THRESHOLD,
    })
  } catch (error) {
    console.error('[Stale Contacts] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stale contacts' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/reminders/stale
 * Generate stale relationship reminders for all stale contacts
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - STALE_DAYS_THRESHOLD)

    // Get stale contacts
    const { data: staleContacts, error: fetchError } = await adminClient
      .from('contacts')
      .select(`
        id,
        name,
        email,
        title,
        company_id,
        last_met_date,
        created_at,
        companies (id, name)
      `)
      .eq('user_id', user.id)
      .or(`last_met_date.lt.${cutoffDate.toISOString()},last_met_date.is.null`)
      .limit(100) as {
        data: Array<{
          id: string
          name: string
          email: string | null
          title: string | null
          company_id: string | null
          last_met_date: string | null
          created_at: string
          companies: { id: string; name: string } | null
        }> | null
        error: Error | null
      }

    if (fetchError) {
      console.error('[Stale Reminders] Fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
    }

    let created = 0
    let skipped = 0

    for (const contact of staleContacts || []) {
      // Check if we've actually met this person
      const { count: meetingCount } = await adminClient
        .from('contact_memos')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', contact.id)

      if (!meetingCount || meetingCount === 0) {
        skipped++
        continue
      }

      // Check if there's already a pending stale reminder for this contact
      const { data: existingReminder } = await adminClient
        .from('reminders')
        .select('id')
        .eq('user_id', user.id)
        .eq('contact_id', contact.id)
        .eq('type', 'stale_relationship')
        .eq('status', 'pending')
        .single()

      if (existingReminder) {
        skipped++
        continue
      }

      // Calculate days since last contact
      const lastDate = contact.last_met_date || contact.created_at
      const daysSince = Math.floor(
        (new Date().getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
      )

      // Create stale relationship reminder
      const companyName = contact.companies?.name
      const title = companyName
        ? `Reconnect with ${contact.name} (${companyName})`
        : `Reconnect with ${contact.name}`

      const context = `You haven't connected with ${contact.name} in ${daysSince} days. ${
        contact.title ? `They're a ${contact.title}` : ''
      }${companyName ? ` at ${companyName}` : ''}. Consider reaching out to maintain the relationship.`

      const { error: insertError } = await adminClient
        .from('reminders')
        .insert({
          user_id: user.id,
          contact_id: contact.id,
          company_id: contact.company_id,
          type: 'stale_relationship',
          title,
          context,
          priority: daysSince > 60 ? 'high' : daysSince > 45 ? 'medium' : 'low',
          status: 'pending',
          due_date: new Date().toISOString().split('T')[0], // Due now
        })

      if (insertError) {
        console.error(`[Stale Reminders] Insert error for ${contact.name}:`, insertError)
      } else {
        created++
      }
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      message: `Created ${created} stale relationship reminders (${skipped} skipped)`,
    })
  } catch (error) {
    console.error('[Stale Reminders] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate reminders' },
      { status: 500 }
    )
  }
}
