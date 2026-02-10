import { NextRequest, NextResponse } from 'next/server'
import { processPendingJobs } from '@/lib/processing'

/**
 * Cron endpoint to process any pending jobs
 * This acts as a fallback to ensure jobs don't get stuck
 *
 * Set up in vercel.json:
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/process-jobs",
 *       "schedule": "* * * * *"
 *     }
 *   ]
 * }
 */
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // In production, verify the cron secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.log('[Cron] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Cron] Processing pending jobs...')

  try {
    const processedCount = await processPendingJobs(5)
    console.log(`[Cron] Processed ${processedCount} jobs`)

    return NextResponse.json({
      success: true,
      processedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Error processing jobs:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    }, { status: 500 })
  }
}

// Also allow POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
