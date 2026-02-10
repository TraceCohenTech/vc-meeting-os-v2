'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import { ArrowRight, CheckCircle2, FileText, Sparkles } from 'lucide-react'

function LoginContent() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
          scopes: 'email profile https://www.googleapis.com/auth/drive.file',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })

      if (authError) {
        setError(authError.message)
        setIsLoading(false)
      }
    } catch {
      setError('An unexpected error occurred')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_18%_12%,rgba(99,102,241,0.24),transparent_34%),radial-gradient(circle_at_84%_6%,rgba(20,184,166,0.2),transparent_28%)]" />

      <main className="relative min-h-screen flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-6">
          <section className="hidden lg:block rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-sm p-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold">VC Meeting OS</p>
                <p className="text-sm text-slate-400">v2 platform</p>
              </div>
            </div>

            <h1 className="text-3xl font-bold tracking-tight leading-tight mb-4">
              Move from transcript overload to investment clarity
            </h1>
            <p className="text-slate-300 mb-8">
              Use one secure workspace for memo generation, follow-up tracking, and AI retrieval over your meeting history.
            </p>

            <ul className="space-y-4">
              {[
                'Generate structured memos in minutes',
                'Track companies and stage movement',
                'Extract and close action items faster',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-sm p-6 md:p-8 lg:p-10 shadow-2xl">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-6">
              <ArrowRight className="w-4 h-4 rotate-180" />
              Back to overview
            </Link>

            <div className="mb-8">
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Secure Google SSO
              </p>
              <h2 className="text-2xl font-bold">Sign in to VC Meeting OS</h2>
              <p className="text-slate-400 mt-2">Continue with your Google account to access your workspace.</p>
            </div>

            {error && (
              <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 px-4 rounded-xl hover:bg-slate-100 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              {isLoading ? 'Redirecting...' : 'Continue with Google'}
            </button>

            <p className="text-xs text-slate-500 mt-5">
              By continuing, you agree to your organization&apos;s security and access policies.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
