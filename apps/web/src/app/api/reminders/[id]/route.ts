import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/reminders/[id]
 * Get a specific reminder
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: reminder, error } = await supabase
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
        contacts (id, name, email, title, company_id),
        companies (id, name, website),
        memos (id, title, summary, meeting_date)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !reminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 })
    }

    return NextResponse.json({ reminder })
  } catch (error) {
    console.error('[Reminders] Get error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get reminder' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/reminders/[id]
 * Update a reminder (complete, dismiss, snooze, edit)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('reminders')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 })
    }

    const body = await request.json()
    const { action, snooze_days, ...updates } = body

    const updateData: Record<string, unknown> = {}

    // Handle special actions
    if (action === 'complete') {
      updateData.status = 'completed'
      updateData.completed_at = new Date().toISOString()
    } else if (action === 'dismiss') {
      updateData.status = 'dismissed'
    } else if (action === 'snooze') {
      const days = snooze_days || 3
      const snoozeUntil = new Date()
      snoozeUntil.setDate(snoozeUntil.getDate() + days)
      updateData.snoozed_until = snoozeUntil.toISOString()
      updateData.status = 'snoozed'
    } else if (action === 'reopen') {
      updateData.status = 'pending'
      updateData.snoozed_until = null
      updateData.completed_at = null
    }

    // Handle direct field updates
    if (updates.title) updateData.title = updates.title.slice(0, 255)
    if (updates.context !== undefined) updateData.context = updates.context
    if (updates.due_date !== undefined) updateData.due_date = updates.due_date
    if (updates.priority) updateData.priority = updates.priority
    if (updates.status) updateData.status = updates.status

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 })
    }

    updateData.updated_at = new Date().toISOString()

    const { data: reminder, error } = await supabase
      .from('reminders')
      .update(updateData as never)
      .eq('id', id)
      .select('id, status, snoozed_until, completed_at')
      .single()

    if (error) {
      console.error('[Reminders] Update error:', error)
      return NextResponse.json({ error: 'Failed to update reminder' }, { status: 500 })
    }

    return NextResponse.json({ reminder, success: true })
  } catch (error) {
    console.error('[Reminders] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update reminder' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/reminders/[id]
 * Delete a reminder
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[Reminders] Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete reminder' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Reminders] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete reminder' },
      { status: 500 }
    )
  }
}
