import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { EditCompanyForm } from './EditCompanyForm'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditCompanyPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: company, error } = await supabase
    .from('companies')
    .select('id, name, website, stage, status, industry, notes')
    .eq('id', id)
    .eq('user_id', user!.id)
    .single() as {
    data: {
      id: string
      name: string
      website: string | null
      stage: string | null
      status: string
      industry: string | null
      notes: string | null
    } | null
    error: Error | null
  }

  if (error || !company) {
    notFound()
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link
        href={`/companies/${id}`}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Company
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-white mb-1">Edit Company</h1>
        <p className="text-slate-400 mb-6">Update pipeline details and notes for {company.name}.</p>
        <EditCompanyForm company={company} />
      </div>
    </div>
  )
}
