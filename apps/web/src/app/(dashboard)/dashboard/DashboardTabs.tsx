'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { LayoutDashboard, FileAudio } from 'lucide-react'

interface Tab {
  id: string
  label: string
  icon: typeof LayoutDashboard
}

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'transcripts', label: 'Transcripts', icon: FileAudio },
]

export function DashboardTabs() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = searchParams.get('tab') || 'overview'

  const handleTabChange = (tabId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tabId === 'overview') {
      params.delete('tab')
    } else {
      params.set('tab', tabId)
    }
    router.push(`/dashboard${params.toString() ? `?${params.toString()}` : ''}`)
  }

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => handleTabChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <tab.icon className="w-4 h-4" />
          {tab.label}
        </button>
      ))}
    </div>
  )
}
