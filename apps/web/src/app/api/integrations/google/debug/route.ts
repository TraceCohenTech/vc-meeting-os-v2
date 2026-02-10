import { NextResponse } from 'next/server'
import { getDebugRedirectUri } from '@/lib/google/drive'

/**
 * GET /api/integrations/google/debug
 * Returns debug information about Google OAuth configuration
 * This endpoint should be removed in production or protected
 */
export async function GET() {
  const redirectUri = getDebugRedirectUri()

  return NextResponse.json({
    redirectUri,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'not set',
    VERCEL_URL: process.env.VERCEL_URL || 'not set',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'set' : 'not set',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'set' : 'not set',
    message: 'Add this redirect URI to your Google Cloud Console: ' + redirectUri,
  })
}
