import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/reminders
 * List all reminders for the current user
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('reminders')
      .select(`
        id,
        type,
        title,
        context,
        due_date,
        snoozed_until,
        status,
        priority,
        source_text,
        created_at,
        completed_at,
        contact_id,
        company_id,
        memo_id,
        contacts (id, name, email),
        companies (id, name),
        memos (id, title)
      `)
      .eq('user_id', user.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(limit)

    // Filter by status
    if (status !== 'all') {
      query = query.eq('status', status)
    }

    // Filter by type
    if (type) {
      query = query.eq('type', type)
    }

    // Exclude snoozed reminders that aren't due yet
    if (status === 'pending') {
      query = query.or('snoozed_until.is.null,snoozed_until.lte.now()')
    }

    const { data: reminders, error } = await query as {
      data: Array<{
        id: string
        type: string
        title: string
        context: string | null
        due_date: string | null
        snoozed_until: string | null
        status: string
        priority: string
        source_text: string | null
        created_at: string
        completed_at: string | null
        contact_id: string | null
        company_id: string | null
        memo_id: string | null
        contacts: { id: string; name: string; email: string | null } | null
        companies: { id: string; name: string } | null
        memos: { id: string; title: string } | null
      }> | null
      error: Error | null
    }

    if (error) {
      console.error('[Reminders] Fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 })
    }

    // Add computed properties
    const enrichedReminders = (reminders || []).map(r => ({
      ...r,
      is_overdue: r.due_date && new Date(r.due_date) < new Date(),
    }))

    return NextResponse.json({
      reminders: enrichedReminders,
      count: enrichedReminders.length,
    })
  } catch (error) {
    console.error('[Reminders] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch reminders' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/reminders
 * Create a new reminder manually
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, title, context, due_date, priority, contact_id, company_id, memo_id } = body

    if (!type || !title) {
      return NextResponse.json({ error: 'type and title are required' }, { status: 400 })
    }

    const validTypes = ['commitment', 'stale_relationship', 'follow_up', 'deadline', 'intro_request']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 })
    }

    const { data: reminder, error } = await supabase
      .from('reminders')
      .insert({
        user_id: user.id,
        type,
        title: title.slice(0, 255),
        context: context || null,
        due_date: due_date || null,
        priority: priority || 'medium',
        contact_id: contact_id || null,
        company_id: company_id || null,
        memo_id: memo_id || null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[Reminders] Create error:', error)
      return NextResponse.json({ error: 'Failed to create reminder' }, { status: 500 })
    }

    return NextResponse.json({ reminder, success: true })
  } catch (error) {
    console.error('[Reminders] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create reminder' },
      { status: 500 }
    )
  }
}
