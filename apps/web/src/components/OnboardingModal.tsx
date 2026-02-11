'use client'

import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Check, Copy, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { trackEvent } from '@/lib/analytics'

interface OnboardingModalProps {
  hasFireflies: boolean
  hasGoogleDrive: boolean
}

export function OnboardingModal({ hasFireflies, hasGoogleDrive }: OnboardingModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ processed: number } | null>(null)
  const router = useRouter()

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/fireflies`
    : ''

  // Check if user has seen onboarding
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('onboarding_completed')
    const hasSeenV2 = localStorage.getItem('onboarding_v2_seen')

    // Don't show if Fireflies is already connected
    if (hasFireflies) {
      return
    }

    // Show if never seen onboarding, or if they haven't connected Fireflies yet
    if (!hasSeenOnboarding && !hasSeenV2) {
      setIsOpen(true)
      localStorage.setItem('onboarding_v2_seen', 'true')
      trackEvent('onboarding_started')
    }
  }, [hasFireflies])

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const connectFireflies = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your API key')
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Not authenticated')
        return
      }

      // Check for existing integration
      const { data: existing } = await supabase
        .from('integrations')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'fireflies')
        .single() as { data: { id: string } | null }

      if (existing) {
        await (supabase.from('integrations') as ReturnType<typeof supabase.from>)
          .update({
            credentials: { api_key: apiKey },
            status: 'active',
            error_message: null,
          } as never)
          .eq('id', existing.id)
      } else {
        await (supabase.from('integrations') as ReturnType<typeof supabase.from>).insert({
          user_id: user.id,
          provider: 'fireflies',
          credentials: { api_key: apiKey },
          status: 'active',
        } as never)
      }

      // Track analytics
      trackEvent('fireflies_connected')

      // Move to next step
      setStep(2)
    } catch {
      setError('Failed to connect. Please check your API key.')
    } finally {
      setIsConnecting(false)
    }
  }

  const syncMemos = async () => {
    setIsSyncing(true)
    setError(null)

    try {
      const response = await fetch('/api/process/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (response.ok) {
        setSyncResult({ processed: data.processed || 0 })
        // Move to completion step
        setStep(3)
      } else {
        setError(data.error || 'Failed to sync')
      }
    } catch {
      setError('Failed to sync memos')
    } finally {
      setIsSyncing(false)
    }
  }

  const completeOnboarding = () => {
    localStorage.setItem('onboarding_completed', 'true')
    setIsOpen(false)
    trackEvent('onboarding_completed')
    router.refresh()
  }

  const skipOnboarding = () => {
    localStorage.setItem('onboarding_v2_seen', 'true')
    setIsOpen(false)
    trackEvent('onboarding_skipped')
  }

  if (!isOpen) return null

  const steps = [
    { title: 'Welcome', icon: '👋' },
    { title: 'Connect Fireflies', icon: '🔥' },
    { title: 'Setup Webhook', icon: '🔗' },
    { title: 'Ready!', icon: '🎉' },
  ]

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-indigo-500' : i < step ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
          <button
            onClick={skipOnboarding}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to Deal Flow OS</h2>
              <p className="text-slate-400 mb-6">
                Turn your meeting recordings into structured investment memos automatically.
              </p>

              <div className="bg-slate-800/50 rounded-xl p-4 text-left mb-6">
                <h3 className="text-white font-medium mb-3">Here&apos;s how it works:</h3>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">1.</span>
                    <span>Connect your Fireflies.ai account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">2.</span>
                    <span>Set up the webhook to receive transcripts automatically</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">3.</span>
                    <span>AI generates structured memos from your meetings</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={skipOnboarding}
                  className="flex-1 px-4 py-2.5 text-slate-400 hover:text-white transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  Get Started
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Connect Fireflies */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🔥</span>
                <div>
                  <h2 className="text-xl font-bold text-white">Connect Fireflies.ai</h2>
                  <p className="text-slate-400 text-sm">Enter your API key to get started</p>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Fireflies API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-white mb-2">How to get your API key:</h4>
                  <ol className="space-y-1 text-sm text-slate-400">
                    <li>1. Go to <a href="https://app.fireflies.ai/integrations" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Fireflies Integrations</a></li>
                    <li>2. Find &quot;Fireflies API&quot; and click it</li>
                    <li>3. Copy your API key</li>
                  </ol>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(0)}
                  className="px-4 py-2.5 text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={connectFireflies}
                  disabled={isConnecting || !apiKey.trim()}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      Connect
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Setup Webhook */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🔗</span>
                <div>
                  <h2 className="text-xl font-bold text-white">Setup Webhook</h2>
                  <p className="text-slate-400 text-sm">So Fireflies can send transcripts automatically</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Your Webhook URL
                  </label>
                  <div className="flex gap-2">
                    <code className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-indigo-400 text-sm font-mono overflow-x-auto">
                      {webhookUrl}
                    </code>
                    <button
                      onClick={copyWebhookUrl}
                      className={`px-4 py-3 rounded-lg transition-colors flex items-center gap-2 ${
                        copied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-white mb-2">How to set up the webhook:</h4>
                  <ol className="space-y-2 text-sm text-slate-400">
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-400 font-medium">1.</span>
                      <span>Go to <a href="https://app.fireflies.ai/integrations/custom/webhook" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-1">Fireflies Webhooks <ExternalLink className="w-3 h-3" /></a></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-400 font-medium">2.</span>
                      <span>Click &quot;Add Webhook&quot;</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-400 font-medium">3.</span>
                      <span>Paste the URL above</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-400 font-medium">4.</span>
                      <span>Select &quot;Transcription completed&quot; event</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-400 font-medium">5.</span>
                      <span>Save the webhook</span>
                    </li>
                  </ol>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-sm text-amber-400">
                    <strong>Tip:</strong> Already have transcripts? Click &quot;Sync Now&quot; to import your recent meetings.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={syncMemos}
                  disabled={isSyncing}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      Sync Now & Continue
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Complete */}
          {step === 3 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">You&apos;re All Set!</h2>

              {syncResult && syncResult.processed > 0 ? (
                <p className="text-slate-400 mb-6">
                  We imported <span className="text-emerald-400 font-semibold">{syncResult.processed}</span> memo{syncResult.processed !== 1 ? 's' : ''} from your recent meetings.
                </p>
              ) : (
                <p className="text-slate-400 mb-6">
                  Your account is connected. New meetings will automatically become memos.
                </p>
              )}

              <div className="bg-slate-800/50 rounded-xl p-4 text-left mb-6">
                <h3 className="text-white font-medium mb-3">What&apos;s next:</h3>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Fireflies connected</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {hasGoogleDrive ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-600" />
                    )}
                    <span>Google Drive {hasGoogleDrive ? 'connected' : '(optional - connect in Settings)'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-slate-600" />
                    <span>Have your first meeting with Fireflies recording</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={completeOnboarding}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors font-medium"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
