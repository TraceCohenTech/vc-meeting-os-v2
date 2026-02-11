import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    steps: [],
  }

  const addStep = (name: string, status: 'pass' | 'fail', data?: unknown) => {
    (diagnostics.steps as Array<unknown>).push({ name, status, data })
  }

  try {
    // Step 1: Check auth
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      addStep('Auth', 'fail', { error: authError?.message || 'No user' })
      return NextResponse.json(diagnostics, { status: 401 })
    }
    addStep('Auth', 'pass', { userId: user.id, email: user.email })

    // Step 2: Check API key
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim()
    if (!apiKey) {
      addStep('API Key Check', 'fail', { error: 'ANTHROPIC_API_KEY not set' })
      return NextResponse.json(diagnostics)
    }
    addStep('API Key Check', 'pass', { keyLength: apiKey.length, keyPrefix: apiKey.slice(0, 10) + '...' })

    // Step 3: Get request body
    const body = await request.json().catch(() => ({}))
    const memoId = body.memoId
    addStep('Request Body', 'pass', { memoId })

    // Step 4: Fetch memo
    const adminClient = createAdminClient()
    const { data: memoData, error: memoError } = await adminClient
      .from('memos')
      .select('id, title, content, meeting_date')
      .eq('id', memoId || 'b53f007d-0efb-491d-971c-b70d0257cfb1') // Default to test memo
      .single() as { data: { id: string; title: string; content: string | null; meeting_date: string | null } | null; error: Error | null }

    if (memoError || !memoData) {
      addStep('Fetch Memo', 'fail', { error: memoError?.message || 'Memo not found' })
      return NextResponse.json(diagnostics)
    }
    const memo = memoData
    addStep('Fetch Memo', 'pass', {
      title: memo.title,
      contentLength: memo.content?.length || 0,
      contentPreview: memo.content?.slice(0, 200) || 'No content'
    })

    // Step 5: Test Claude API with improved prompt
    const testPrompt = `Extract ONLY HUMAN PEOPLE from this text.

DO NOT extract company names, VC funds, locations, or products.
ONLY extract individual humans with actual names.

Text: "${memo.content?.slice(0, 2000) || 'No content'}"

Return ONLY a JSON array of people like: [{"name": "John Smith"}, {"name": "Jane Doe"}]
If a company like "Red Point" or "G2" is mentioned, do NOT include it - only include actual people.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{ role: 'user', content: testPrompt }],
      }),
    })

    const claudeData = await claudeResponse.json()

    if (!claudeResponse.ok) {
      addStep('Claude API Call', 'fail', {
        status: claudeResponse.status,
        error: claudeData
      })
      return NextResponse.json(diagnostics)
    }

    const aiText = claudeData.content?.[0]?.text || ''
    addStep('Claude API Call', 'pass', {
      status: claudeResponse.status,
      responseLength: aiText.length,
      rawResponse: aiText.slice(0, 500)
    })

    // Step 6: Parse JSON from response
    const jsonMatch = aiText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      addStep('Parse JSON', 'fail', { error: 'No JSON array found in response' })
      return NextResponse.json(diagnostics)
    }

    let contacts: Array<{ name: string }>
    try {
      contacts = JSON.parse(jsonMatch[0])
      addStep('Parse JSON', 'pass', {
        contactCount: contacts.length,
        contacts: contacts.map(c => c.name)
      })
    } catch (parseError) {
      addStep('Parse JSON', 'fail', { error: String(parseError), jsonText: jsonMatch[0].slice(0, 200) })
      return NextResponse.json(diagnostics)
    }

    // Step 7: Check existing contacts
    const { data: existingContacts } = await adminClient
      .from('contacts')
      .select('id, name')
      .eq('user_id', user.id) as { data: Array<{ id: string; name: string }> | null }

    addStep('Existing Contacts', 'pass', {
      count: existingContacts?.length || 0,
      names: existingContacts?.map(c => c.name) || []
    })

    // Step 8: Filter out user's name and insert ALL contacts
    const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || ''
    const userNameLower = userName.toLowerCase()

    const filteredContacts = contacts.filter(c => {
      const nameLower = c.name.toLowerCase()
      if (userNameLower && (nameLower.includes(userNameLower) || userNameLower.includes(nameLower))) {
        return false
      }
      return true
    })

    addStep('Filter User Name', 'pass', {
      userName,
      beforeFilter: contacts.map(c => c.name),
      afterFilter: filteredContacts.map(c => c.name)
    })

    const insertResults: Array<{ name: string; status: string; id?: string; error?: string }> = []

    for (const contact of filteredContacts) {
      // Check if already exists
      const { data: existing } = await adminClient
        .from('contacts')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', contact.name)
        .single() as { data: { id: string } | null }

      if (existing) {
        insertResults.push({ name: contact.name, status: 'exists', id: existing.id })
      } else {
        const { data: newContact, error: insertError } = await adminClient
          .from('contacts')
          .insert({
            user_id: user.id,
            name: contact.name,
            notes: 'Extracted from memo',
          } as never)
          .select('id')
          .single() as { data: { id: string } | null; error: Error | null }

        if (insertError) {
          insertResults.push({ name: contact.name, status: 'error', error: insertError.message })
        } else {
          insertResults.push({ name: contact.name, status: 'created', id: newContact?.id })
        }
      }
    }

    addStep('Insert All Contacts', 'pass', { results: insertResults })

    diagnostics.success = true
    return NextResponse.json(diagnostics)

  } catch (error) {
    diagnostics.error = String(error)
    diagnostics.stack = error instanceof Error ? error.stack : undefined
    return NextResponse.json(diagnostics, { status: 500 })
  }
}
