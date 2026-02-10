import { createClient } from '@/lib/supabase/server'
import { FolderOpen } from 'lucide-react'
import { FolderList } from './FolderList'
import { NewFolderButton } from './NewFolderButton'

export default async function FoldersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch folders with memo counts
  const { data: folders, error } = await supabase
    .from('folders')
    .select(`
      *,
      memos(count)
    `)
    .eq('user_id', user!.id)
    .order('sort_order') as { data: Array<{
      id: string
      user_id: string
      name: string
      color: string | null
      icon: string | null
      template: Record<string, unknown>
      is_default: boolean
      sort_order: number
      created_at: string
      updated_at: string
      memos: Array<{ count: number }>
    }> | null, error: Error | null }

  // Transform to include memo count
  const foldersWithCounts = folders?.map((folder) => ({
    id: folder.id,
    user_id: folder.user_id,
    name: folder.name,
    color: folder.color,
    icon: folder.icon,
    template: folder.template as Record<string, unknown>,
    is_default: folder.is_default,
    sort_order: folder.sort_order,
    created_at: folder.created_at,
    updated_at: folder.updated_at,
    memoCount: folder.memos?.[0]?.count || 0,
  })) as Array<{
    id: string
    user_id: string
    name: string
    color: string | null
    icon: string | null
    template: Record<string, unknown>
    is_default: boolean
    sort_order: number
    created_at: string
    updated_at: string
    memoCount: number
  }> | undefined

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Folders</h1>
          <p className="text-slate-400 mt-1">
            Organize your memos into categories with custom templates
          </p>
        </div>
        <NewFolderButton />
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400">Error: {error.message}</p>
        </div>
      ) : foldersWithCounts && foldersWithCounts.length > 0 ? (
        <FolderList folders={foldersWithCounts} />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No folders yet</h3>
          <p className="text-slate-400 mb-6">
            Create folders to organize your memos by category
          </p>
          <NewFolderButton variant="primary" />
        </div>
      )}
    </div>
  )
}
