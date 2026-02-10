'use client'

import { useSearchParams } from 'next/navigation'
import { TranscriptsTab } from './TranscriptsTab'
import { ReactNode } from 'react'

interface DashboardContentProps {
  overviewContent: ReactNode
}

export function DashboardContent({ overviewContent }: DashboardContentProps) {
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'overview'

  if (activeTab === 'transcripts') {
    return <TranscriptsTab />
  }

  return <>{overviewContent}</>
}
