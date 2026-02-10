import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/process/retry
 * Triggers processing for all pending jobs for the current user
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()

    // Get all pending jobs for this user
    const { data: pendingJobs } = await (adminClient
      .from('processing_jobs') as ReturnType<typeof adminClient.from>)
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true }) as unknown as { data: Array<{ id: string }> | null }

    if (!pendingJobs || pendingJobs.length === 0) {
      return NextResponse.json({ message: 'No pending jobs to process', processed: 0 })
    }

    // Get base URL for internal calls
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    const url = baseUrl?.startsWith('http') ? baseUrl : `https://${baseUrl}`

    // Process each job
    let processed = 0
    const errors: string[] = []

    for (const job of pendingJobs) {
      try {
        const response = await fetch(`${url}/api/process/direct`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: job.id }),
        })

        if (response.ok) {
          processed++
        } else {
          const errorData = await response.json()
          errors.push(`Job ${job.id}: ${errorData.error || 'Unknown error'}`)
        }
      } catch (error) {
        errors.push(`Job ${job.id}: ${error instanceof Error ? error.message : 'Request failed'}`)
      }
    }

    return NextResponse.json({
      message: `Processed ${processed} of ${pendingJobs.length} jobs`,
      processed,
      total: pendingJobs.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Retry processing error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retry processing' },
      { status: 500 }
    )
  }
}
