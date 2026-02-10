import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * DELETE /api/process/clear
 * Clears failed and empty pending jobs for the current user
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()

    // Delete failed jobs
    const { count: failedCount } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'failed') as unknown as { count: number | null }

    // Delete pending jobs that are older than 10 minutes (stuck)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count: staleCount } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lt('created_at', tenMinutesAgo) as unknown as { count: number | null }

    // Delete "processing" jobs stuck for more than 10 minutes (should never take that long)
    const { count: stuckCount } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'processing')
      .lt('updated_at', tenMinutesAgo) as unknown as { count: number | null }

    // Delete completed jobs older than 2 hours (they've been viewed)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { count: oldCount } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .lt('updated_at', twoHoursAgo) as unknown as { count: number | null }

    return NextResponse.json({
      message: 'Cleared jobs',
      cleared: {
        failed: failedCount || 0,
        stale: staleCount || 0,
        stuck: stuckCount || 0,
        old: oldCount || 0,
      },
    })
  } catch (error) {
    console.error('Clear jobs error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear jobs' },
      { status: 500 }
    )
  }
}
