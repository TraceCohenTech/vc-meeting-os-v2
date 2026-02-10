import { TranscriptsTab } from '../dashboard/TranscriptsTab'

export default function TranscriptsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Transcripts</h1>
        <p className="text-slate-400 mt-1">
          Import meeting transcripts from Fireflies and generate investment memos
        </p>
      </div>

      <TranscriptsTab />
    </div>
  )
}
