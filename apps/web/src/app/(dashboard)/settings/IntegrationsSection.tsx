'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, ExternalLink, Loader2, FolderOpen, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { Integration } from '@/lib/supabase/types'

interface IntegrationsSectionProps {
  integrations: Integration[]
}

const providers = [
  {
    id: 'fireflies',
    name: 'Fireflies.ai',
    description: 'Automatically import meeting transcripts via webhook',
    icon: '🔥',
    authType: 'api_key' as const,
    helpUrl: 'https://fireflies.ai/integrations',
    helpText: 'Get your API key',
    category: 'sources',
  },
  {
    id: 'granola',
    name: 'Granola',
    description: 'Import transcripts via webhook',
    icon: '🥣',
    authType: 'api_key' as const,
    helpUrl: 'https://granola.so/settings/integrations',
    helpText: 'Get your webhook secret',
    category: 'sources',
  },
  {
    id: 'google',
    name: 'Google Drive',
    description: 'Auto-save memos to Deal Flow folder in Drive',
    icon: '📁',
    authType: 'oauth' as const,
    oauthUrl: '/api/integrations/google',
    category: 'storage',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Import cloud recordings and transcripts',
    icon: '📹',
    authType: 'oauth' as const,
    comingSoon: true,
    category: 'sources',
  },
  {
    id: 'otter',
    name: 'Otter.ai',
    description: 'Import Otter transcripts',
    icon: '🦦',
    authType: 'api_key' as const,
    comingSoon: true,
    category: 'sources',
  },
]

const sourceProviders = providers.filter(p => p.category === 'sources')
const storageProviders = providers.filter(p => p.category === 'storage')

export function IntegrationsSection({ integrations }: IntegrationsSectionProps) {
  const router = useRouter()
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState<string>('')
  const [showApiKeyFor, setShowApiKeyFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const getIntegration = (providerId: string) =>
    integrations.find((i) => i.provider === providerId)

  const connectOAuth = (oauthUrl: string) => {
    window.location.href = oauthUrl
  }

  const connectWithApiKey = async (providerId: string) => {
    if (!apiKeyInput.trim()) {
      setError('API key is required')
      return
    }

    setConnectingId(providerId)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Not authenticated')
        return
      }

      const existing = getIntegration(providerId)

      if (existing) {
        // Update existing
        const { error: updateError } = await (supabase.from('integrations') as ReturnType<typeof supabase.from>)
          .update({
            credentials: { api_key: apiKeyInput },
            status: 'active',
            error_message: null,
          } as never)
          .eq('id', existing.id)

        if (updateError) {
          console.error('Update error:', updateError)
          setError(`Failed to update: ${updateError.message}`)
          return
        }
      } else {
        // Create new
        const { error: insertError } = await (supabase.from('integrations') as ReturnType<typeof supabase.from>).insert({
          user_id: user.id,
          provider: providerId,
          credentials: { api_key: apiKeyInput },
          status: 'active',
        } as never)

        if (insertError) {
          console.error('Insert error:', insertError)
          setError(`Failed to save: ${insertError.message}`)
          return
        }
      }

      setApiKeyInput('')
      setShowApiKeyFor(null)
      router.refresh()

      // Trigger backfill for Fireflies to import recent transcripts
      if (providerId === 'fireflies') {
        console.log('[Integrations] Triggering backfill for Fireflies...')
        fetch('/api/process/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        }).then(res => res.json()).then(data => {
          console.log('[Integrations] Backfill result:', data)
        }).catch(err => {
          console.error('[Integrations] Backfill failed:', err)
        })
      }
    } catch {
      setError('Failed to connect integration')
    } finally {
      setConnectingId(null)
    }
  }

  const disconnect = async (integrationId: string) => {
    if (!confirm('Are you sure you want to disconnect this integration?')) return

    setConnectingId(integrationId)
    const supabase = createClient()
    await supabase.from('integrations').delete().eq('id', integrationId)
    setConnectingId(null)
    router.refresh()
  }

  const renderProvider = (provider: typeof providers[0]) => {
    const integration = getIntegration(provider.id)
    const isConnected = integration?.status === 'active'
    const hasError = integration?.status === 'error'
    const credentials = integration?.credentials as { drive_folder_id?: string } | null

    return (
      <div
        key={provider.id}
        className={`p-4 rounded-xl border ${
          provider.comingSoon
            ? 'bg-slate-800/30 border-slate-800'
            : 'bg-slate-800/50 border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{provider.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-white">{provider.name}</h3>
                {provider.comingSoon && (
                  <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded-full">
                    Coming Soon
                  </span>
                )}
                {isConnected && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
                {hasError && (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
              </div>
              <p className="text-sm text-slate-400">{provider.description}</p>
              {hasError && integration?.error_message && (
                <p className="text-xs text-red-400 mt-1">
                  Error: {integration.error_message}
                </p>
              )}
              {isConnected && provider.id === 'google' && credentials?.drive_folder_id && (
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                  <FolderOpen className="w-3 h-3" />
                  Deal Flow folder connected
                </p>
              )}
            </div>
          </div>

          {!provider.comingSoon && (
            <div>
              {isConnected ? (
                <button
                  onClick={() => disconnect(integration!.id)}
                  disabled={connectingId === integration!.id}
                  className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  {connectingId === integration!.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Disconnect'
                  )}
                </button>
              ) : provider.authType === 'oauth' && provider.oauthUrl ? (
                <button
                  onClick={() => connectOAuth(provider.oauthUrl!)}
                  className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors"
                >
                  Connect
                </button>
              ) : (
                <button
                  onClick={() => setShowApiKeyFor(showApiKeyFor === provider.id ? null : provider.id)}
                  className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
          )}
        </div>

        {/* API Key input */}
        {showApiKeyFor === provider.id && provider.authType === 'api_key' && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            {error && (
              <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={provider.id === 'granola' ? 'Enter webhook secret' : 'Enter your API key'}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => connectWithApiKey(provider.id)}
                disabled={connectingId === provider.id}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 disabled:opacity-50"
              >
                {connectingId === provider.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </button>
            </div>
            {provider.helpUrl && (
              <a
                href={provider.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-2"
              >
                {provider.helpText || 'Get your API key'}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Sources Section */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3">Meeting Sources</h3>
        <p className="text-xs text-slate-500 mb-3">
          Connect your meeting recording services to automatically import transcripts
        </p>
        <div className="space-y-3">
          {sourceProviders.map(renderProvider)}
        </div>
      </div>

      {/* Storage Section */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-3">Storage & Export</h3>
        <p className="text-xs text-slate-500 mb-3">
          Connect cloud storage to automatically save and sync your memos
        </p>
        <div className="space-y-3">
          {storageProviders.map(renderProvider)}
        </div>
      </div>

      {/* Webhook Setup Guide */}
      <WebhookSetupGuide />
    </div>
  )
}

function WebhookSetupGuide() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const webhookUrls = {
    fireflies: typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/fireflies` : '',
    granola: typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/granola` : '',
  }

  const copyUrl = async (type: 'fireflies' | 'granola') => {
    await navigator.clipboard.writeText(webhookUrls[type])
    setCopiedUrl(type)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  return (
    <div className="bg-slate-800/30 border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
      >
        <div>
          <h4 className="text-sm font-medium text-white text-left">Webhook Setup Guide</h4>
          <p className="text-xs text-slate-400 text-left">
            Configure webhooks for automatic transcript imports
          </p>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-700 pt-4">
          {/* Fireflies Webhook */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <h5 className="text-sm font-medium text-white">Fireflies Webhook</h5>
            </div>

            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-indigo-400 text-xs font-mono overflow-x-auto">
                {webhookUrls.fireflies}
              </code>
              <button
                onClick={() => copyUrl('fireflies')}
                className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 text-sm ${
                  copiedUrl === 'fireflies'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {copiedUrl === 'fireflies' ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-3">
              <h6 className="text-xs font-medium text-slate-300 mb-2">Setup Instructions:</h6>
              <ol className="space-y-1.5 text-xs text-slate-400">
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
                  <span>Select &quot;Transcription completed&quot; as the event type</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-400 font-medium">5.</span>
                  <span>Save the webhook</span>
                </li>
              </ol>
            </div>
          </div>

          {/* Granola Webhook */}
          <div className="space-y-3 pt-3 border-t border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-lg">🥣</span>
              <h5 className="text-sm font-medium text-white">Granola Webhook</h5>
            </div>

            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-indigo-400 text-xs font-mono overflow-x-auto">
                {webhookUrls.granola}
              </code>
              <button
                onClick={() => copyUrl('granola')}
                className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 text-sm ${
                  copiedUrl === 'granola'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {copiedUrl === 'granola' ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Configure this URL in your Granola settings to receive meeting transcripts.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
