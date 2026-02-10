'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Upload, Loader2, Flame, Clock, Users, CheckCircle2, RefreshCw, Zap, Settings, Cloud, Video } from 'lucide-react'

interface FirefliesTranscript {
  id: string
  title: string
  date: string
  duration: number
  participants: string[]
  imported: boolean
}

interface IntegrationStatus {
  fireflies: boolean
  granola: boolean
  google: boolean
}

export default function NewMemoPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'sources' | 'process' | 'manual'>('sources')
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Integration status
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    fireflies: false,
    granola: false,
    google: false,
  })
  const [integrationsLoaded, setIntegrationsLoaded] = useState(false)

  // Fireflies state
  const [firefliesTranscripts, setFirefliesTranscripts] = useState<FirefliesTranscript[]>([])
  const [firefliesLoading, setFirefliesLoading] = useState(false)
  const [firefliesError, setFirefliesError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    transcript: '',
  })

  // Check all integrations status
  useEffect(() => {
    async function checkIntegrations() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await (supabase
          .from('integrations') as ReturnType<typeof supabase.from>)
          .select('provider, status')
          .eq('user_id', user.id) as unknown as { data: Array<{ provider: string; status: string }> | null }

        const status: IntegrationStatus = {
          fireflies: false,
          granola: false,
          google: false,
        }

        for (const integration of data || []) {
          if (integration.status === 'active') {
            if (integration.provider === 'fireflies') status.fireflies = true
            if (integration.provider === 'granola') status.granola = true
            if (integration.provider === 'google') status.google = true
          }
        }

        setIntegrations(status)
        setIntegrationsLoaded(true)
      } catch {
        setIntegrationsLoaded(true)
      }
    }
    checkIntegrations()
  }, [])

  const fetchFirefliesTranscripts = async () => {
    setFirefliesLoading(true)
    setFirefliesError(null)

    try {
      const response = await fetch('/api/integrations/fireflies/transcripts')
      const data = await response.json()

      if (!response.ok) {
        setFirefliesError(data.error || 'Failed to fetch transcripts')
        return
      }

      setFirefliesTranscripts(data.transcripts || [])
    } catch {
      setFirefliesError('Failed to connect to Fireflies')
    } finally {
      setFirefliesLoading(false)
    }
  }

  useEffect(() => {
    if (mode === 'sources' && integrations.fireflies && firefliesTranscripts.length === 0) {
      fetchFirefliesTranscripts()
    }
  }, [mode, integrations.fireflies, firefliesTranscripts.length])

  const connectedCount = Object.values(integrations).filter(Boolean).length
  const hasAnySource = connectedCount > 0

  const importFirefliesTranscript = async (transcriptId: string) => {
    setIsProcessing(true)
    setProcessingStatus('Fetching transcript...')
    setError(null)

    try {
      setProcessingStatus('Analyzing meeting type...')

      const response = await fetch('/api/process/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'fireflies',
          transcriptId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Processing failed')
      }

      // Success - redirect to the memo
      router.push(`/memos/${result.memoId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transcript')
      setIsProcessing(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Not authenticated')
        return
      }

      // Get default folder
      const { data: defaultFolder } = await supabase
        .from('folders')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .single()

      const result = await (supabase
        .from('memos') as ReturnType<typeof supabase.from>)
        .insert({
          user_id: user.id,
          folder_id: (defaultFolder as { id: string } | null)?.id || null,
          source: 'manual',
          title: formData.title,
          content: formData.content,
        } as never)
        .select('id')
        .single() as unknown as { data: { id: string } | null, error: Error | null }

      if (result.error) {
        setError(result.error.message)
        return
      }

      if (result.data) {
        router.push(`/memos/${result.data.id}`)
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleProcessSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsProcessing(true)
    setProcessingStatus('Analyzing transcript...')
    setError(null)

    try {
      const response = await fetch('/api/process/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          content: formData.transcript,
          title: formData.title || 'Meeting Memo',
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Processing failed')
      }

      // Success - redirect to the memo
      router.push(`/memos/${result.memoId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process transcript')
      setIsProcessing(false)
    }
  }

  // Processing overlay
  if (isProcessing) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping" />
            <div className="relative bg-indigo-600 rounded-full w-full h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Processing Your Meeting</h2>
          <p className="text-slate-400 mb-4">{processingStatus}</p>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>This usually takes 15-30 seconds</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">New Memo</h1>
      <p className="text-slate-400 text-sm mb-6">
        Import from connected sources or paste a transcript for AI processing
      </p>

      {/* Connected Sources Status */}
      <div className="mb-6 p-4 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium text-white">Connected Sources</span>
          </div>
          <Link
            href="/settings"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <Settings className="w-3 h-3" />
            Manage
          </Link>
        </div>
        <div className="flex gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
            integrations.fireflies ? 'bg-orange-500/10 text-orange-400' : 'bg-slate-800 text-slate-500'
          }`}>
            <Flame className="w-4 h-4" />
            Fireflies
            {integrations.fireflies && <CheckCircle2 className="w-3 h-3" />}
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
            integrations.granola ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}>
            <Cloud className="w-4 h-4" />
            Granola
            {integrations.granola && <CheckCircle2 className="w-3 h-3" />}
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
            integrations.google ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'
          }`}>
            <Video className="w-4 h-4" />
            Google Meet
            {integrations.google && <CheckCircle2 className="w-3 h-3" />}
          </div>
        </div>
        {!hasAnySource && integrationsLoaded && (
          <p className="text-xs text-slate-500 mt-3">
            Connect a source in{' '}
            <Link href="/settings" className="text-indigo-400 hover:text-indigo-300">
              Settings
            </Link>
            {' '}for automatic memo generation
          </p>
        )}
      </div>

      {/* Mode toggle - Reordered to prioritize AI sources */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('sources')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
            mode === 'sources'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-5 h-5" />
          Import
        </button>
        <button
          onClick={() => setMode('process')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
            mode === 'process'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Upload className="w-5 h-5" />
          Paste
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-slate-700 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-5 h-5" />
          Manual
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {mode === 'sources' ? (
        <div className="space-y-6">
          {/* Auto-processing info */}
          <div className="p-4 bg-gradient-to-r from-indigo-600/10 to-cyan-600/10 border border-indigo-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-indigo-400 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-white">Automatic Processing Enabled</h3>
                <p className="text-xs text-slate-400 mt-1">
                  New meetings from connected sources will be automatically processed and appear in your dashboard.
                  You can also manually import specific transcripts below.
                </p>
              </div>
            </div>
          </div>

          {/* Fireflies Section */}
          {integrations.fireflies && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-medium text-white">Fireflies Transcripts</span>
                </div>
                <button
                  onClick={fetchFirefliesTranscripts}
                  disabled={firefliesLoading}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${firefliesLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {firefliesError && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-3">
                  <p className="text-red-400 text-sm">{firefliesError}</p>
                </div>
              )}

              {firefliesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
                </div>
              ) : firefliesTranscripts.length > 0 ? (
                <div className="space-y-2">
                  {firefliesTranscripts.map((transcript) => (
                    <div
                      key={transcript.id}
                      className={`p-4 rounded-xl border transition-colors ${
                        transcript.imported
                          ? 'bg-slate-800/30 border-slate-800'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-white truncate">
                              {transcript.title}
                            </h3>
                            {transcript.imported && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                Imported
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {transcript.date ? new Date(transcript.date).toLocaleDateString() : 'Unknown date'}
                            </span>
                            {transcript.duration > 0 && (
                              <span>{formatDuration(transcript.duration)}</span>
                            )}
                            {transcript.participants?.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />
                                {transcript.participants.length}
                              </span>
                            )}
                          </div>
                        </div>
                        {!transcript.imported && (
                          <button
                            onClick={() => importFirefliesTranscript(transcript.id)}
                            disabled={isLoading}
                            className="px-4 py-2 bg-orange-600 text-white text-sm rounded-lg font-medium hover:bg-orange-500 transition-colors disabled:opacity-50"
                          >
                            Import
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
                  <Flame className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <h3 className="font-medium text-white text-sm mb-1">No transcripts found</h3>
                  <p className="text-xs text-slate-400">
                    Record a meeting with Fireflies to see it here
                  </p>
                </div>
              )}
            </div>
          )}

          {/* No sources connected state */}
          {!hasAnySource && integrationsLoaded && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
              <Zap className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="font-medium text-white mb-2">No Sources Connected</h3>
              <p className="text-sm text-slate-400 mb-4">
                Connect a meeting source to enable automatic memo generation
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-500 transition-colors"
              >
                <Settings className="w-4 h-4" />
                Connect Sources
              </Link>
            </div>
          )}
        </div>
      ) : mode === 'manual' ? (
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Meeting with Acme Inc..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Content *
            </label>
            <textarea
              required
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={15}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono text-sm"
              placeholder="Write your memo content..."
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating...
              </span>
            ) : (
              'Create Memo'
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleProcessSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Title (optional)
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Meeting title..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Transcript *
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Paste your meeting transcript and AI will generate a structured memo
            </p>
            <textarea
              required
              value={formData.transcript}
              onChange={(e) => setFormData({ ...formData, transcript: e.target.value })}
              rows={15}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono text-sm"
              placeholder="Speaker 1: Hello, thanks for meeting with us today...
Speaker 2: Thanks for having me..."
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !formData.transcript.trim()}
            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Starting...
              </span>
            ) : (
              'Process Transcript'
            )}
          </button>
        </form>
      )}
    </div>
  )
}
