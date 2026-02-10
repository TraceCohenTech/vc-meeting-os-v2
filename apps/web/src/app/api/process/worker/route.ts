import { NextResponse } from 'next/server'
import { processPendingJobs, retryStaleProcessingJobs } from '@/lib/processing'

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return false
  }

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${secret}`
}

async function runWorker(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') || '3')
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 10) : 3

  const recoveredStale = await retryStaleProcessingJobs()
  const processed = await processPendingJobs(safeLimit)

  return NextResponse.json({
    ok: true,
    recoveredStale,
    processed,
  })
}

export async function GET(request: Request) {
  return runWorker(request)
}

export async function POST(request: Request) {
  return runWorker(request)
}
