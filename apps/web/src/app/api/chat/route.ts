import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface MemoResult {
  id: string
  title: string
  content: string
  meeting_date: string | null
}

interface StatsResult {
  total_memos: number
  total_companies: number
  active_deals: number
  pending_tasks: number
}

export async function POST(request: Request) {
  try {
    const { message, conversationId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Search for relevant memos using FTS
    // @ts-expect-error - Supabase RPC types
    const { data: relevantMemos } = await supabase.rpc('search_memos', {
      search_query: message,
      p_user_id: user.id,
      result_limit: 5,
    }) as { data: MemoResult[] | null }

    // Build context from relevant memos
    let context = ''
    const sources: Array<{ id: string; title: string }> = []

    if (relevantMemos && relevantMemos.length > 0) {
      context = relevantMemos
        .map((memo) => {
          sources.push({ id: memo.id, title: memo.title })
          return `
Meeting: ${memo.title}
Date: ${memo.meeting_date ? new Date(memo.meeting_date).toLocaleDateString() : 'Unknown'}
Content:
${memo.content.slice(0, 2000)}${memo.content.length > 2000 ? '...' : ''}
---`
        })
        .join('\n\n')
    }

    // Also fetch some general stats for context
    // @ts-expect-error - Supabase RPC types
    const { data: stats } = await supabase.rpc('get_user_stats', {
      p_user_id: user.id,
    }) as { data: StatsResult | null }

    const systemContext = `You are an AI assistant helping a venture capitalist manage their deal flow and meeting notes. You have access to their meeting memos and can answer questions about their meetings, companies, and action items.

Current portfolio stats:
- Total memos: ${stats?.total_memos || 0}
- Total companies tracked: ${stats?.total_companies || 0}
- Active deals: ${stats?.active_deals || 0}
- Pending tasks: ${stats?.pending_tasks || 0}

${context ? `Relevant meeting context:\n${context}` : 'No specific meeting context found for this query.'}

Instructions:
- Answer questions based on the meeting context provided
- If you cite information, mention which meeting it came from
- Be concise and professional
- If you don't have enough context to answer, say so
- Help with tasks like summarizing meetings, finding patterns, and tracking follow-ups`

    // Generate response using Claude
    const { text } = await generateText({
      model: anthropic('claude-3-haiku-20240307'),
      system: systemContext,
      prompt: message,
    })

    // Create or update conversation
    let currentConversationId = conversationId

    if (!currentConversationId) {
      // Create new conversation
      const result = await (supabase.from('conversations') as ReturnType<typeof supabase.from>)
        .insert({
          user_id: user.id,
          title: message.slice(0, 100),
        } as never)
        .select('id')
        .single() as unknown as { data: { id: string } | null, error: Error | null }

      if (result.error) {
        console.error('Error creating conversation:', result.error)
      } else if (result.data) {
        currentConversationId = result.data.id
      }
    } else {
      // Update conversation timestamp
      await (supabase.from('conversations') as ReturnType<typeof supabase.from>)
        .update({ updated_at: new Date().toISOString() } as never)
        .eq('id', currentConversationId)
    }

    // Save messages to database
    if (currentConversationId) {
      // Save user message
      await (supabase.from('messages') as ReturnType<typeof supabase.from>).insert({
        conversation_id: currentConversationId,
        role: 'user',
        content: message,
      } as never)

      // Save assistant message
      const msgResult = await (supabase.from('messages') as ReturnType<typeof supabase.from>)
        .insert({
          conversation_id: currentConversationId,
          role: 'assistant',
          content: text,
          sources: sources,
        } as never)
        .select('id')
        .single() as unknown as { data: { id: string } | null }

      return NextResponse.json({
        response: text,
        sources: sources.length > 0 ? sources : undefined,
        conversationId: currentConversationId,
        messageId: msgResult.data?.id,
      })
    }

    return NextResponse.json({
      response: text,
      sources: sources.length > 0 ? sources : undefined,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    )
  }
}
