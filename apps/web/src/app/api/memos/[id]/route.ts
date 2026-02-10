import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { deleteMemoFromDrive } from '@/lib/google/drive'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only select columns that exist in the memos table
    const { data: memo, error } = await (supabase
      .from('memos') as ReturnType<typeof supabase.from>)
      .select(`
        id,
        title,
        summary,
        content,
        meeting_date,
        tags,
        source,
        drive_file_id,
        drive_web_view_link,
        created_at,
        companies (id, name)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single() as { data: Record<string, unknown> | null; error: Error | null }

    if (error || !memo) {
      return NextResponse.json({ error: 'Memo not found' }, { status: 404 })
    }

    return NextResponse.json({ memo })
  } catch (error) {
    console.error('Get memo error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get memo' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the memo to verify ownership and get Drive file ID
    const { data: memo, error: fetchError } = await (supabase
      .from('memos') as ReturnType<typeof supabase.from>)
      .select('id, user_id, drive_file_id')
      .eq('id', id)
      .single() as { data: { id: string; user_id: string; drive_file_id: string | null } | null; error: Error | null }

    if (fetchError || !memo) {
      return NextResponse.json({ error: 'Memo not found' }, { status: 404 })
    }

    if (memo.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete from Google Drive if linked
    if (memo.drive_file_id) {
      const { data: googleIntegration } = await (adminClient
        .from('integrations') as ReturnType<typeof adminClient.from>)
        .select('credentials')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .eq('status', 'active')
        .single() as { data: { credentials: { access_token: string; refresh_token?: string } } | null }

      if (googleIntegration?.credentials?.access_token) {
        try {
          await deleteMemoFromDrive(
            googleIntegration.credentials.access_token,
            googleIntegration.credentials.refresh_token,
            memo.drive_file_id
          )
        } catch (error) {
          console.error('Failed to delete from Drive:', error)
          // Continue with database deletion even if Drive fails
        }
      }
    }

    // Delete associated tasks
    await (supabase
      .from('tasks') as ReturnType<typeof supabase.from>)
      .delete()
      .eq('memo_id', id)

    // Delete from imported_transcripts table
    await (adminClient
      .from('imported_transcripts') as ReturnType<typeof adminClient.from>)
      .delete()
      .eq('memo_id', id)

    // Delete the memo
    const { error: deleteError } = await (supabase
      .from('memos') as ReturnType<typeof supabase.from>)
      .delete()
      .eq('id', id) as { error: Error | null }

    if (deleteError) {
      console.error('Failed to delete memo:', deleteError)
      return NextResponse.json({ error: 'Failed to delete memo' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete memo error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    )
  }
}
