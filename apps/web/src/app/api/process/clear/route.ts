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

    // Delete pending jobs that are older than 1 hour and have no transcript content
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: staleCount } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lt('created_at', oneHourAgo) as unknown as { count: number | null }

    // Delete completed jobs older than 24 hours
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: oldCount } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .lt('updated_at', dayAgo) as unknown as { count: number | null }

    return NextResponse.json({
      message: 'Cleared jobs',
      cleared: {
        failed: failedCount || 0,
        stale: staleCount || 0,
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
