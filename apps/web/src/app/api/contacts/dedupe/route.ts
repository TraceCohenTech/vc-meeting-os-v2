import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/contacts/dedupe
 * Merges duplicate contacts (same name) for the current user
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()

    // Get all contacts for this user
    const { data: contacts, error: fetchError } = await adminClient
      .from('contacts')
      .select('id, name, email, title, phone, linkedin_url, company_id, notes, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }) as {
        data: Array<{
          id: string
          name: string
          email: string | null
          title: string | null
          phone: string | null
          linkedin_url: string | null
          company_id: string | null
          notes: string | null
          created_at: string
        }> | null
        error: Error | null
      }

    if (fetchError || !contacts) {
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
    }

    // Group contacts by normalized name (lowercase, trimmed)
    const grouped: Record<string, typeof contacts> = {}
    for (const contact of contacts) {
      const normalizedName = contact.name.toLowerCase().trim()
      if (!grouped[normalizedName]) {
        grouped[normalizedName] = []
      }
      grouped[normalizedName].push(contact)
    }

    // Find duplicates and merge them
    let mergedCount = 0
    let deletedCount = 0

    for (const [name, dupes] of Object.entries(grouped)) {
      if (dupes.length <= 1) continue

      // Keep the first one (oldest), merge data from others
      const keeper = dupes[0]
      const toDelete = dupes.slice(1)

      // Merge data from duplicates into keeper
      const mergedData: Record<string, unknown> = {}
      let mergedNotes = keeper.notes || ''

      for (const dupe of toDelete) {
        // Take non-null values from duplicates if keeper doesn't have them
        if (dupe.email && !keeper.email) mergedData.email = dupe.email
        if (dupe.title && !keeper.title) mergedData.title = dupe.title
        if (dupe.phone && !keeper.phone) mergedData.phone = dupe.phone
        if (dupe.linkedin_url && !keeper.linkedin_url) mergedData.linkedin_url = dupe.linkedin_url
        if (dupe.company_id && !keeper.company_id) mergedData.company_id = dupe.company_id

        // Append notes from duplicates
        if (dupe.notes && !mergedNotes.includes(dupe.notes)) {
          mergedNotes = mergedNotes ? `${mergedNotes}\n\n${dupe.notes}` : dupe.notes
        }
      }

      if (mergedNotes !== keeper.notes) {
        mergedData.notes = mergedNotes
      }

      // Update keeper with merged data
      if (Object.keys(mergedData).length > 0) {
        await adminClient
          .from('contacts')
          .update(mergedData as never)
          .eq('id', keeper.id)
        mergedCount++
      }

      // Move any contact_memos references to the keeper
      for (const dupe of toDelete) {
        await adminClient
          .from('contact_memos')
          .update({ contact_id: keeper.id } as never)
          .eq('contact_id', dupe.id)
      }

      // Delete the duplicates
      for (const dupe of toDelete) {
        await adminClient
          .from('contacts')
          .delete()
          .eq('id', dupe.id)
        deletedCount++
      }

      console.log(`[Dedupe] Merged "${name}": kept ${keeper.id}, deleted ${toDelete.length} duplicates`)
    }

    return NextResponse.json({
      success: true,
      message: `Merged ${mergedCount} contacts, deleted ${deletedCount} duplicates`,
      merged: mergedCount,
      deleted: deletedCount,
    })

  } catch (error) {
    console.error('[Dedupe] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to dedupe contacts' },
      { status: 500 }
    )
  }
}
