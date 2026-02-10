'use client'

import { useState, useEffect } from 'react'
import { FileText, Clock, Users, Loader2, CheckCircle2, ExternalLink, FolderOpen, AlertCircle, Sparkles } from 'lucide-react'

interface Transcript {
  id: string
  title: string
  date: string
  duration: number
  participants: string[]
  imported: boolean
}

interface GeneratedMemo {
  id: string
  title: string
  summary: string
  content: string
  companyName?: string
  driveLink?: string
}

export function TranscriptsTab() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatedMemo, setGeneratedMemo] = useState<GeneratedMemo | null>(null)
  const [generatingStep, setGeneratingStep] = useState<string>('')

  useEffect(() => {
    fetchTranscripts()
  }, [])

  const fetchTranscripts = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/integrations/fireflies/transcripts')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch transcripts')
      }

      setTranscripts(data.transcripts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcripts')
    } finally {
      setLoading(false)
    }
  }

  const generateMemo = async (transcript: Transcript) => {
    setGenerating(true)
    setGeneratedMemo(null)
    setGeneratingStep('Fetching transcript...')

    try {
      // Call the sync processing endpoint
      setGeneratingStep('Analyzing meeting...')
      const res = await fetch('/api/process/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'fireflies',
          transcriptId: transcript.id,
          title: transcript.title,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate memo')
      }

      setGeneratingStep('Loading memo...')

      // Fetch the created memo
      const memoRes = await fetch(`/api/memos/${data.memoId}`)
      const memoData = await memoRes.json()

      if (!memoRes.ok) {
        throw new Error('Failed to load generated memo')
      }

      setGeneratedMemo({
        id: memoData.memo.id,
        title: memoData.memo.title,
        summary: memoData.memo.summary || '',
        content: memoData.memo.content,
        companyName: memoData.memo.companies?.name,
        driveLink: memoData.memo.drive_web_view_link,
      })

      // Mark as imported in the list
      setTranscripts(prev =>
        prev.map(t => t.id === transcript.id ? { ...t, imported: true } : t)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate memo')
    } finally {
      setGenerating(false)
      setGeneratingStep('')
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    })
  }

  const selectedTranscript = transcripts.find(t => t.id === selectedId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        <span className="ml-3 text-slate-400">Loading transcripts...</span>
      </div>
    )
  }

  if (error && !transcripts.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">
          {error.includes('not connected') ? 'Fireflies Not Connected' : 'Error Loading Transcripts'}
        </h3>
        <p className="text-slate-400 mb-4">{error}</p>
        {error.includes('not connected') && (
          <a
            href="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
          >
            Connect Fireflies
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Transcripts List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Fireflies Transcripts</h2>
          <p className="text-sm text-slate-400 mt-1">Select a transcript to generate a memo</p>
        </div>

        <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
          {transcripts.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No transcripts found</p>
              <p className="text-sm text-slate-500 mt-1">New meetings will appear here automatically</p>
            </div>
          ) : (
            transcripts.map((transcript) => (
              <button
                key={transcript.id}
                onClick={() => {
                  setSelectedId(transcript.id)
                  setGeneratedMemo(null)
                }}
                className={`w-full p-4 text-left hover:bg-slate-800/50 transition-colors ${
                  selectedId === transcript.id ? 'bg-slate-800/70 border-l-2 border-indigo-500' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white truncate">{transcript.title}</h3>
                      {transcript.imported && (
                        <span className="flex-shrink-0 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                          Imported
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(transcript.date)}
                      </span>
                      <span>{formatDuration(transcript.duration)}</span>
                      {transcript.participants.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {transcript.participants.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Transcript Detail / Memo Preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {!selectedTranscript ? (
          <div className="h-full flex items-center justify-center p-8 text-center">
            <div>
              <Sparkles className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Select a transcript to preview</p>
              <p className="text-sm text-slate-500 mt-1">Then generate a memo with one click</p>
            </div>
          </div>
        ) : generatedMemo ? (
          // Show generated memo
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-800 bg-emerald-500/10">
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Memo Generated</span>
              </div>
              <h2 className="text-lg font-semibold text-white">{generatedMemo.title}</h2>
              {generatedMemo.companyName && (
                <p className="text-sm text-slate-400 mt-1">Company: {generatedMemo.companyName}</p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {generatedMemo.summary && (
                <div className="mb-4 p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-sm text-slate-300">{generatedMemo.summary}</p>
                </div>
              )}
              <div className="prose prose-invert prose-sm max-w-none">
                <div
                  className="text-slate-300 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: generatedMemo.content
                      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-white mt-4 mb-2">$1</h2>')
                      .replace(/^### (.+)$/gm, '<h3 class="text-base font-medium text-white mt-3 mb-1">$1</h3>')
                      .replace(/^\* (.+)$/gm, '<li class="ml-4">$1</li>')
                      .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
                      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
                  }}
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 flex items-center gap-3">
              <a
                href={`/memos/${generatedMemo.id}`}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-medium"
              >
                <FolderOpen className="w-4 h-4" />
                View Full Memo
              </a>
              {generatedMemo.driveLink && (
                <a
                  href={generatedMemo.driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Google Docs
                </a>
              )}
            </div>
          </div>
        ) : (
          // Show transcript preview with generate button
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-white">{selectedTranscript.title}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                <span>{formatDate(selectedTranscript.date)}</span>
                <span>{formatDuration(selectedTranscript.duration)}</span>
                {selectedTranscript.participants.length > 0 && (
                  <span>{selectedTranscript.participants.length} participants</span>
                )}
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
              {selectedTranscript.participants.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-slate-400 mb-2">Participants</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedTranscript.participants.map((p, i) => (
                      <span key={i} className="px-2 py-1 bg-slate-800 text-slate-300 text-sm rounded">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-800/30 rounded-lg border border-dashed border-slate-700 text-center">
                <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
                <p className="text-slate-300 mb-1">Ready to generate a memo</p>
                <p className="text-sm text-slate-500">
                  AI will analyze the transcript and create a structured investment memo
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800">
              {error && (
                <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                  {error}
                </div>
              )}
              <button
                onClick={() => generateMemo(selectedTranscript)}
                disabled={generating || selectedTranscript.imported}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {generatingStep || 'Generating...'}
                  </>
                ) : selectedTranscript.imported ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Already Imported
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Memo
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
