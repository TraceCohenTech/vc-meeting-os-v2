import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { processTranscriptToMemo } from '@/lib/processing'

/**
 * Backfill endpoint - fetches recent Fireflies transcripts and processes any that are missing
 * This provides a safety net for webhooks that might have been missed
 *
 * Can be called:
 * - Manually via POST /api/process/backfill
 * - Via cron job for scheduled backfill
 */
export async function POST(request: Request) {
  const startTime = Date.now()
  const adminClient = createAdminClient()

  try {
    // Optional: pass userId in body for single-user backfill
    const body = await request.json().catch(() => ({}))
    const targetUserId = body.userId

    console.log('[Backfill] Starting...', targetUserId ? `for user ${targetUserId}` : 'for all users')

    // Get all users with active Fireflies integrations
    const { data: integrations, error: intError } = await (adminClient
      .from('integrations') as ReturnType<typeof adminClient.from>)
      .select('user_id, credentials')
      .eq('provider', 'fireflies')
      .eq('status', 'active') as { data: Array<{ user_id: string; credentials: { api_key?: string } | null }> | null; error: unknown }

    if (intError || !integrations || integrations.length === 0) {
      console.log('[Backfill] No active Fireflies integrations found')
      return NextResponse.json({ message: 'No active integrations', processed: 0 })
    }

    // Filter to specific user if provided
    const usersToProcess = targetUserId
      ? integrations.filter(i => i.user_id === targetUserId)
      : integrations

    let totalProcessed = 0
    let totalSkipped = 0
    let totalErrors = 0
    const results: Array<{ userId: string; processed: number; skipped: number; errors: number }> = []

    for (const integration of usersToProcess) {
      if (!integration.credentials?.api_key) {
        console.log(`[Backfill] No API key for user ${integration.user_id}`)
        continue
      }

      const userResult = await backfillUser(
        adminClient,
        integration.user_id,
        integration.credentials.api_key
      )

      results.push({
        userId: integration.user_id,
        ...userResult,
      })

      totalProcessed += userResult.processed
      totalSkipped += userResult.skipped
      totalErrors += userResult.errors
    }

    console.log(`[Backfill] Complete in ${Date.now() - startTime}ms. Processed: ${totalProcessed}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`)

    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      skipped: totalSkipped,
      errors: totalErrors,
      processingTime: Date.now() - startTime,
      details: results,
    })
  } catch (error) {
    console.error('[Backfill] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backfill failed' },
      { status: 500 }
    )
  }
}

async function backfillUser(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  apiKey: string
): Promise<{ processed: number; skipped: number; errors: number }> {
  const cleanApiKey = apiKey.trim()

  console.log(`[Backfill] Processing user ${userId}`)

  try {
    // Fetch recent transcripts from Fireflies (last 30 days)
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanApiKey}`,
      },
      body: JSON.stringify({
        query: `
          query RecentTranscripts {
            transcripts(limit: 20) {
              id
              title
              date
              duration
            }
          }
        `,
      }),
    })

    if (!response.ok) {
      console.error(`[Backfill] Fireflies API error for user ${userId}:`, response.status)
      return { processed: 0, skipped: 0, errors: 1 }
    }

    const data = await response.json()
    if (data.errors) {
      console.error(`[Backfill] Fireflies GraphQL errors for user ${userId}:`, data.errors)
      return { processed: 0, skipped: 0, errors: 1 }
    }

    const transcripts = data.data?.transcripts || []
    console.log(`[Backfill] Found ${transcripts.length} transcripts for user ${userId}`)

    // Get already imported transcripts
    const { data: imported } = await (adminClient
      .from('imported_transcripts') as ReturnType<typeof adminClient.from>)
      .select('source_id')
      .eq('user_id', userId)
      .eq('source', 'fireflies') as { data: Array<{ source_id: string }> | null }

    const importedIds = new Set((imported || []).map(i => i.source_id))

    let processed = 0
    let skipped = 0
    let errors = 0

    for (const transcript of transcripts) {
      // Skip if already imported
      if (importedIds.has(transcript.id)) {
        skipped++
        continue
      }

      // Process this transcript
      try {
        console.log(`[Backfill] Processing transcript ${transcript.id}: ${transcript.title}`)

        const result = await processTranscriptToMemo({
          source: 'fireflies',
          transcriptId: transcript.id,
          userId,
          metadata: {
            title: transcript.title,
            date: transcript.date,
          },
        })

        if (result.success) {
          processed++
          console.log(`[Backfill] Created memo ${result.memoId} for transcript ${transcript.id}`)
        } else {
          errors++
          console.error(`[Backfill] Failed to process transcript ${transcript.id}:`, result.error)
        }
      } catch (err) {
        errors++
        console.error(`[Backfill] Error processing transcript ${transcript.id}:`, err)
      }

      // Small delay between processing to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return { processed, skipped, errors }
  } catch (error) {
    console.error(`[Backfill] Error for user ${userId}:`, error)
    return { processed: 0, skipped: 0, errors: 1 }
  }
}

// Allow GET for easy testing/triggering
export async function GET() {
  return NextResponse.json({
    message: 'Backfill endpoint. Use POST to trigger backfill.',
    usage: 'POST /api/process/backfill with optional { userId: "..." } body',
  })
}
