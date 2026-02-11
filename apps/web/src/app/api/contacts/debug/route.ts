import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Use Claude Haiku for testing
async function callAI(prompt: string): Promise<{ success: boolean; content?: string; error?: string }> {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()

  if (!apiKey) {
    return { success: false, error: 'ANTHROPIC_API_KEY not configured' }
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    return { success: false, error: `Claude API error: ${response.status} - ${JSON.stringify(data)}` }
  }

  if (!data.content || !data.content[0]) {
    return { success: false, error: `Unexpected response: ${JSON.stringify(data)}` }
  }

  return { success: true, content: data.content[0].text }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { memoId } = body

    if (!memoId) {
      return NextResponse.json({ error: 'memoId required' }, { status: 400 })
    }

    // Get the memo
    const { data: memo, error: memoError } = await supabase
      .from('memos')
      .select('id, title, content')
      .eq('id', memoId)
      .eq('user_id', user.id)
      .single() as { data: { id: string; title: string; content: string | null } | null; error: Error | null }

    if (memoError) {
      return NextResponse.json({ error: 'Database error', details: String(memoError) }, { status: 500 })
    }

    if (!memo || !memo.content) {
      return NextResponse.json({ error: 'Memo not found or empty', memoId, userId: user.id }, { status: 404 })
    }

    const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || ''

  const prompt = `You are analyzing a meeting memo to extract ALL people mentioned for a CRM.

EXCLUDE: "${userName}" (the user who wrote this memo)

CRITICAL: Extract EVERY person mentioned, no matter how briefly. This includes:
- Meeting participants listed at the start
- People mentioned by first name only (e.g., "Assaf", "Trent", "Mike")
- People who referred deals or made introductions
- Anyone mentioned even once in passing (e.g., "previously met with Assaf")
- LPs, advisors, portfolio company founders mentioned

For each person, extract:
- name: Their name (first name is OK)
- relationship_type: One of: founder, investor, advisor, executive, operator, other
- notes: Brief context

Return ONLY a valid JSON array.

EXAMPLE: For "The meeting was between Trent Herren and Zach... Mike, an LP, referred... met with Assaf..."
[
  {"name": "Trent Herren", "relationship_type": "investor", "notes": "Meeting participant"},
  {"name": "Zach", "relationship_type": "investor", "notes": "Meeting participant"},
  {"name": "Mike", "relationship_type": "investor", "notes": "LP who referred a deal"},
  {"name": "Assaf", "relationship_type": "other", "notes": "Previously met"}
]

MEMO CONTENT:
${memo.content.slice(0, 12000)}`

    const aiResult = await callAI(prompt)

    if (!aiResult.success) {
      return NextResponse.json({
        error: 'AI API failed',
        details: aiResult.error,
        memoTitle: memo.title,
        userName,
      }, { status: 500 })
    }

    const result = aiResult.content || ''

    // Try to parse JSON
    const jsonMatch = result.match(/\[[\s\S]*\]/)

    return NextResponse.json({
      memoTitle: memo.title,
      memoContentPreview: memo.content.slice(0, 500),
      userName,
      rawAiResponse: result,
      parsedContacts: jsonMatch ? JSON.parse(jsonMatch[0]) : null,
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Request failed',
      details: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 })
  }
}
