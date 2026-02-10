import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'vc-meeting-os',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

// Event types for type-safe event handling
export type TranscriptReceivedEvent = {
  name: 'transcript/received'
  data: {
    jobId: string
    userId: string
    source: 'fireflies' | 'granola' | 'google_meet' | 'manual' | 'file'
    transcriptId?: string
    transcriptContent?: string
    title?: string
    metadata?: {
      participants?: string[]
      duration?: number
      meetingDate?: string
    }
  }
}

export type MemoCreatedEvent = {
  name: 'memo/created'
  data: {
    memoId: string
    userId: string
    companyId?: string
    shouldFileToDrive?: boolean
  }
}

export type Events = {
  'transcript/received': TranscriptReceivedEvent
  'memo/created': MemoCreatedEvent
}
