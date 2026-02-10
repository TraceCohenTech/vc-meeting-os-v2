import { createClient } from '@/lib/supabase/server'
import { FileText, Upload, Zap } from 'lucide-react'
import Link from 'next/link'
import { MemoSearch } from './MemoSearch'
import { MemoCard } from './MemoCard'

interface SearchParams {
  q?: string
  folder?: string
  company?: string
}

export default async function MemosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch folders for filter
  const { data: folders } = await supabase
    .from('folders')
    .select('id, name, color')
    .eq('user_id', user!.id)
    .order('sort_order')

  // Fetch companies for filter
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('user_id', user!.id)
    .order('name')

  // Fetch memos with search
  let memos = null
  let searchError = null

  if (params.q) {
    // Use FTS search
    // @ts-expect-error - Supabase RPC types
    const { data, error } = await supabase.rpc('search_memos', {
      search_query: params.q,
      p_user_id: user!.id,
      result_limit: 50,
    }) as { data: Array<{
      id: string
      title: string
      summary: string | null
      content: string
      meeting_date: string | null
      company_id: string | null
      folder_id: string | null
      rank: number
    }> | null, error: Error | null }
    memos = data
    searchError = error
  } else {
    // Regular query
    let query = supabase
      .from('memos')
      .select(`
        id,
        title,
        summary,
        meeting_date,
        tags,
        created_at,
        folder_id,
        company_id,
        folders(id, name, color),
        companies(id, name)
      `)
      .eq('user_id', user!.id)
      .order('meeting_date', { ascending: false, nullsFirst: false })

    if (params.folder) {
      query = query.eq('folder_id', params.folder)
    }

    if (params.company) {
      query = query.eq('company_id', params.company)
    }

    const { data, error } = await query.limit(50) as { data: Array<{
      id: string
      title: string
      summary: string | null
      meeting_date: string | null
      tags: string[] | null
      created_at: string
      folder_id: string | null
      company_id: string | null
      folders: { id: string; name: string; color: string } | null
      companies: { id: string; name: string } | null
    }> | null, error: Error | null }
    memos = data
    searchError = error
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Memos</h1>
          <p className="text-slate-400 mt-1">
            Your meeting notes and investment memos
          </p>
        </div>
        <Link
          href="/memos/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors"
        >
          <FileText className="w-5 h-5" />
          New Memo
        </Link>
      </div>

      {/* Search and Filters */}
      <MemoSearch
        folders={folders || []}
        companies={companies || []}
        currentQuery={params.q}
        currentFolder={params.folder}
        currentCompany={params.company}
      />

      {/* Results */}
      {searchError ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-red-400">Error: {searchError.message}</p>
        </div>
      ) : memos && memos.length > 0 ? (
        <div className="space-y-3">
          {memos.map((memo) => {
            const folder = 'folders' in memo ? memo.folders as { id: string; name: string; color: string } | null : null
            const company = 'companies' in memo ? memo.companies as { id: string; name: string } | null : null
            const tags = 'tags' in memo ? (memo.tags as string[] | null) : null

            return (
              <MemoCard
                key={memo.id}
                memo={{
                  id: memo.id,
                  title: memo.title,
                  summary: memo.summary,
                  meeting_date: memo.meeting_date,
                  tags,
                  folder,
                  company,
                }}
              />
            )
          })}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {params.q ? 'No memos found' : 'No memos yet'}
            </h3>
            <p className="text-slate-400 mb-8">
              {params.q
                ? 'Try a different search term or clear your filters'
                : 'Get started by importing a meeting transcript or creating your first memo'}
            </p>
            {!params.q && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/memos/new"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors"
                >
                  <Zap className="w-5 h-5" />
                  Import Transcript
                </Link>
                <span className="text-slate-500">or</span>
                <Link
                  href="/memos/new?mode=process"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  Paste Transcript
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
