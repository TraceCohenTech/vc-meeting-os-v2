'use client'

import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, ExternalLink, Copy, Sparkles } from 'lucide-react'
import Link from 'next/link'

interface SetupChecklistProps {
  hasFireflies: boolean
  hasGoogleDrive: boolean
  hasMemos: boolean
}

export function SetupChecklist({ hasFireflies, hasGoogleDrive, hasMemos }: SetupChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [copied, setCopied] = useState(false)

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/fireflies`
    : ''

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const completedCount = [hasFireflies, hasGoogleDrive, hasMemos].filter(Boolean).length
  const totalSteps = 3
  const isComplete = completedCount === totalSteps

  // Don't show if everything is set up
  if (isComplete) {
    return null
  }

  const steps = [
    {
      id: 'fireflies',
      title: 'Connect Fireflies.ai',
      description: 'Link your Fireflies account to import meeting transcripts',
      completed: hasFireflies,
      action: hasFireflies ? null : (
        <Link
          href="/settings"
          className="text-sm text-indigo-400 hover:text-indigo-300 font-medium"
        >
          Go to Settings →
        </Link>
      ),
    },
    {
      id: 'webhook',
      title: 'Set up Fireflies webhook',
      description: 'Enable automatic transcript imports when meetings end',
      completed: hasFireflies && hasMemos, // Assume webhook is set up if they have memos and fireflies
      action: hasFireflies ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="text-xs bg-slate-800 px-2 py-1 rounded text-indigo-400 font-mono truncate max-w-[200px]">
              {webhookUrl}
            </code>
            <button
              onClick={copyWebhookUrl}
              className={`p-1.5 rounded transition-colors ${
                copied ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <a
            href="https://app.fireflies.ai/integrations/custom/webhook"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
          >
            Open Fireflies Webhooks <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : (
        <span className="text-xs text-slate-500">Connect Fireflies first</span>
      ),
    },
    {
      id: 'drive',
      title: 'Connect Google Drive (optional)',
      description: 'Auto-save memos to a Deal Flow folder in Drive',
      completed: hasGoogleDrive,
      action: hasGoogleDrive ? null : (
        <Link
          href="/settings"
          className="text-sm text-indigo-400 hover:text-indigo-300 font-medium"
        >
          Go to Settings →
        </Link>
      ),
    },
  ]

  return (
    <div className="mb-6 bg-gradient-to-r from-indigo-600/10 to-purple-600/10 border border-indigo-500/20 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600/20 p-2 rounded-lg">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-left">
            <h3 className="text-white font-semibold">Get Started</h3>
            <p className="text-sm text-slate-400">
              {completedCount} of {totalSteps} steps completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress bar */}
          <div className="w-24 bg-slate-700 rounded-full h-2 hidden sm:block">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all"
              style={{ width: `${(completedCount / totalSteps) * 100}%` }}
            />
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Steps */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-start gap-3 p-3 rounded-lg ${
                step.completed ? 'bg-emerald-500/10' : 'bg-slate-800/50'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  step.completed
                    ? 'bg-emerald-500'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {step.completed ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`font-medium ${step.completed ? 'text-emerald-400' : 'text-white'}`}>
                  {step.title}
                </h4>
                <p className="text-sm text-slate-400 mt-0.5">
                  {step.description}
                </p>
                {!step.completed && step.action && (
                  <div className="mt-2">
                    {step.action}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
