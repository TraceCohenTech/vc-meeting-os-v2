'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Loader2, XCircle, FileText } from 'lucide-react'
import Link from 'next/link'

interface ProcessingJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  current_step: string | null
  progress: number
  result: { memo_id?: string; company_id?: string }
  error: string | null
}

const stepLabels: Record<string, string> = {
  queued: 'Queued for processing...',
  fetching: 'Fetching transcript...',
  analyzing: 'Analyzing content...',
  extracting: 'Extracting company info...',
  generating: 'Generating memo...',
  saving: 'Saving memo...',
  completed: 'Completed!',
}

interface ProcessingProgressProps {
  jobId: string
  onComplete?: (result: ProcessingJob['result']) => void
  onError?: (error: string) => void
}

export function ProcessingProgress({ jobId, onComplete, onError }: ProcessingProgressProps) {
  const [job, setJob] = useState<ProcessingJob | null>(null)
  const supabase = createClient()

  useEffect(() => {
    // Initial fetch
    const fetchJob = async () => {
      const { data } = await (supabase
        .from('processing_jobs') as ReturnType<typeof supabase.from>)
        .select('*')
        .eq('id', jobId)
        .single() as unknown as { data: ProcessingJob | null }

      if (data) {
        setJob(data)
        if (data.status === 'completed') {
          onComplete?.(data.result)
        } else if (data.status === 'failed') {
          onError?.(data.error || 'Processing failed')
        }
      }
    }

    fetchJob()

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`processing_job_${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const newJob = payload.new as ProcessingJob
          setJob(newJob)

          if (newJob.status === 'completed') {
            onComplete?.(newJob.result)
          } else if (newJob.status === 'failed') {
            onError?.(newJob.error || 'Processing failed')
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId, supabase, onComplete, onError])

  if (!job) {
    return (
      <div className="flex items-center gap-3 p-4 bg-slate-800 rounded-xl">
        <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
        <span className="text-slate-300">Loading...</span>
      </div>
    )
  }

  const isCompleted = job.status === 'completed'
  const isFailed = job.status === 'failed'
  const isPending = job.status === 'pending'

  return (
    <div className="bg-slate-800 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        {isCompleted ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        ) : isFailed ? (
          <XCircle className="w-6 h-6 text-red-500" />
        ) : (
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        )}
        <h3 className="font-semibold text-white">
          {isCompleted
            ? 'Processing Complete'
            : isFailed
            ? 'Processing Failed'
            : isPending
            ? 'Queued'
            : 'Processing...'}
        </h3>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">
            {stepLabels[job.current_step || (isPending ? 'queued' : 'fetching')] || job.current_step}
          </span>
          <span className="text-slate-500">{job.progress}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isFailed ? 'bg-red-500' : isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Error message */}
      {isFailed && job.error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
          <p className="text-sm text-red-400">{job.error}</p>
        </div>
      )}

      {/* Success actions */}
      {isCompleted && job.result?.memo_id && (
        <div className="flex gap-3">
          <Link
            href={`/memos/${job.result.memo_id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors"
          >
            <FileText className="w-4 h-4" />
            View Memo
          </Link>
        </div>
      )}
    </div>
  )
}
