import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Fireflies integration
    const { data: integration } = await (supabase
      .from('integrations') as ReturnType<typeof supabase.from>)
      .select('credentials, status')
      .eq('user_id', user.id)
      .eq('provider', 'fireflies')
      .single() as unknown as { data: { credentials: { api_key?: string } | null; status: string } | null }

    if (!integration) {
      return NextResponse.json({ error: 'Fireflies not connected' }, { status: 400 })
    }

    const credentials = integration.credentials
    if (!credentials?.api_key) {
      return NextResponse.json({ error: 'Fireflies API key missing' }, { status: 400 })
    }

    // Fetch transcripts from Fireflies
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.api_key}`,
      },
      body: JSON.stringify({
        query: `
          query Transcripts {
            transcripts(limit: 50) {
              id
              title
              date
              duration
              participants
              transcript_url
            }
          }
        `,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Fireflies API error:', errorText)
      return NextResponse.json({ error: 'Failed to fetch from Fireflies' }, { status: 500 })
    }

    const data = await response.json()

    if (data.errors) {
      console.error('Fireflies GraphQL errors:', data.errors)
      return NextResponse.json({ error: data.errors[0]?.message || 'Fireflies API error' }, { status: 500 })
    }

    // Get existing imported transcript IDs
    const { data: existingMemos } = await (supabase
      .from('memos') as ReturnType<typeof supabase.from>)
      .select('source_id')
      .eq('user_id', user.id)
      .eq('source', 'fireflies') as unknown as { data: Array<{ source_id: string | null }> | null }

    const importedIds = new Set((existingMemos || []).map(m => m.source_id))

    // Mark which transcripts are already imported
    const transcripts = (data.data?.transcripts || []).map((t: {
      id: string
      title: string
      date: string
      duration: number
      participants: string[]
    }) => ({
      id: t.id,
      title: t.title,
      date: t.date,
      duration: t.duration,
      participants: t.participants || [],
      imported: importedIds.has(t.id),
    }))

    return NextResponse.json({ transcripts })
  } catch (error) {
    console.error('Error fetching Fireflies transcripts:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
