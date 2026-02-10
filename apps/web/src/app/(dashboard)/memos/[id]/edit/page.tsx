import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { EditMemoForm } from './EditMemoForm'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditMemoPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: memo, error } = await supabase
    .from('memos')
    .select('id, title, content, summary, meeting_date')
    .eq('id', id)
    .eq('user_id', user!.id)
    .single()

  if (error || !memo) {
    notFound()
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        href={`/memos/${id}`}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Memo
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-white mb-1">Edit Memo</h1>
        <p className="text-slate-400 mb-6">Update this meeting memo and summary.</p>
        <EditMemoForm memo={memo} />
      </div>
    </div>
  )
}
