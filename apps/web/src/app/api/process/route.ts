import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ingestTranscript, type TranscriptSource } from '@/lib/ingestion'

export async function POST(request: Request) {
  try {
    const { transcriptId, source = 'manual', transcriptContent, title } = await request.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use the unified ingestion handler which creates the job and sends Inngest event
    const result = await ingestTranscript(
      {
        source: source as TranscriptSource,
        transcriptId,
        content: transcriptContent,
        metadata: {
          title: title || 'Meeting Memo',
        },
      },
      user.id
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ jobId: result.jobId })
  } catch (error) {
    console.error('Process API error:', error)
    return NextResponse.json({ error: 'Failed to start processing' }, { status: 500 })
  }
}
