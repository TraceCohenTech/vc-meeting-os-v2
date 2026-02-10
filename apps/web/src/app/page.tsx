import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, FileText, Bot, Building2, CheckSquare, ShieldCheck } from 'lucide-react'

const valueProps = [
  {
    icon: FileText,
    title: 'Meeting-to-Memo Pipeline',
    description: 'Turn raw transcript text into clear investment memos with consistent structure.',
  },
  {
    icon: Building2,
    title: 'Deal Tracking Context',
    description: 'Auto-link notes to companies, stages, and status so pipeline data stays current.',
  },
  {
    icon: CheckSquare,
    title: 'Action Item Capture',
    description: 'Extract follow-ups and track task completion without manual copy/paste.',
  },
  {
    icon: Bot,
    title: 'Portfolio Q&A Assistant',
    description: 'Ask questions across your internal memo corpus and get source-grounded answers.',
  },
]

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.22),transparent_35%),radial-gradient(circle_at_85%_0%,rgba(16,185,129,0.18),transparent_30%)]" />

      <header className="relative border-b border-slate-800/70">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold">VC Meeting OS</p>
              <p className="text-xs text-slate-400">Memo intelligence for deal teams</p>
            </div>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium"
          >
            Sign In
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <section>
            <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Private by default, scoped to your workspace
            </p>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              Your VC team&apos;s operating system for meeting intelligence
            </h1>

            <p className="text-slate-300 text-lg mt-5 max-w-xl">
              Capture transcripts, generate structured memos, track follow-ups, and query your knowledge base in one workflow.
            </p>

            <div className="flex flex-wrap gap-3 mt-8">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold"
              >
                Continue with Google
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://vc-meeting-os-frontend.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 font-medium"
              >
                View v1 reference
              </a>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-sm p-6 md:p-7">
            <h2 className="text-lg font-semibold mb-4">What v2 gives you</h2>
            <div className="space-y-3">
              {valueProps.map((item) => (
                <div key={item.title} className="p-4 rounded-xl border border-slate-800 bg-slate-900">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center mt-0.5">
                      <item.icon className="w-4 h-4 text-indigo-300" />
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-100">{item.title}</h3>
                      <p className="text-sm text-slate-400 mt-1">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="relative border-t border-slate-800/70 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} VC Meeting OS. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
