'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { FolderOpen, MoreVertical, Pencil, Trash2, FileText, Star } from 'lucide-react'
interface FolderWithCount {
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
}

interface FolderListProps {
  folders: FolderWithCount[]
}

export function FolderList({ folders }: FolderListProps) {
  const router = useRouter()
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const colors = [
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
  ]

  const startEditing = (folder: FolderWithCount) => {
    setEditingId(folder.id)
    setEditName(folder.name)
    setEditColor(folder.color || '#6366f1')
    setMenuOpenId(null)
  }

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return

    const supabase = createClient()
    // @ts-expect-error - Supabase types
    await supabase.from('folders').update({ name: editName, color: editColor }).eq('id', editingId)

    setEditingId(null)
    router.refresh()
  }

  const deleteFolder = async (folderId: string) => {
    if (!confirm('Are you sure? Memos in this folder will not be deleted.')) return

    const supabase = createClient()
    await supabase.from('folders').delete().eq('id', folderId)

    setMenuOpenId(null)
    router.refresh()
  }

  const setAsDefault = async (folderId: string) => {
    const supabase = createClient()

    // Remove default from all folders
    // @ts-expect-error - Supabase types
    await supabase.from('folders').update({ is_default: false }).neq('id', folderId)

    // Set this folder as default
    // @ts-expect-error - Supabase types
    await supabase.from('folders').update({ is_default: true }).eq('id', folderId)

    setMenuOpenId(null)
    router.refresh()
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {folders.map((folder) => (
        <div
          key={folder.id}
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
        >
          {editingId === folder.id ? (
            <div className="space-y-4">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setEditColor(color)}
                    className={`w-6 h-6 rounded-full ${
                      editColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingId(null)}
                  className="flex-1 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${folder.color}20` }}
                  >
                    <FolderOpen className="w-5 h-5" style={{ color: folder.color || '#6366f1' }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white">{folder.name}</h3>
                      {folder.is_default && (
                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {folder.memoCount} memo{folder.memoCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setMenuOpenId(menuOpenId === folder.id ? null : folder.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {menuOpenId === folder.id && (
                    <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 py-1">
                      <button
                        onClick={() => startEditing(folder)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </button>
                      {!folder.is_default && (
                        <button
                          onClick={() => setAsDefault(folder.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                        >
                          <Star className="w-4 h-4" />
                          Set as Default
                        </button>
                      )}
                      <button
                        onClick={() => deleteFolder(folder.id)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-slate-700"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <a
                href={`/memos?folder=${folder.id}`}
                className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
              >
                <FileText className="w-4 h-4" />
                View memos
              </a>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
