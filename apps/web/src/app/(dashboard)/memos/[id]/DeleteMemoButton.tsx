'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

interface DeleteMemoButtonProps {
  memoId: string
}

export function DeleteMemoButton({ memoId }: DeleteMemoButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this memo? This action cannot be undone.')) {
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      await supabase.from('memos').delete().eq('id', memoId)
      router.push('/memos')
    } catch (error) {
      console.error('Error deleting memo:', error)
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isLoading}
      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Trash2 className="w-5 h-5" />
      )}
    </button>
  )
}
