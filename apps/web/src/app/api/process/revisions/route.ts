import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const memoId = searchParams.get('memoId')

  if (!memoId) {
    return NextResponse.json({ error: 'memoId is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: memo, error: memoError } = await supabase
    .from('memos')
    .select('id')
    .eq('id', memoId)
    .eq('user_id', user.id)
    .single()

  if (memoError || !memo) {
    return NextResponse.json({ error: 'Memo not found' }, { status: 404 })
  }

  const { data: revisions, error } = await supabase
    .from('memo_revisions')
    .select('id, created_at, title, summary')
    .eq('memo_id', memoId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ revisions: revisions || [] })
}
