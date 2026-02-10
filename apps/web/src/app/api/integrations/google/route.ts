import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGoogleDriveAuthUrl, getDebugRedirectUri } from '@/lib/google/drive'

/**
 * GET /api/integrations/google
 * Initiates the Google Drive OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Log the redirect URI for debugging
    console.log('Google OAuth - Redirect URI:', getDebugRedirectUri())
    console.log('Google OAuth - NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL)
    console.log('Google OAuth - VERCEL_URL:', process.env.VERCEL_URL)

    // Generate OAuth URL with user ID as state
    const authUrl = getGoogleDriveAuthUrl(user.id)

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Failed to initiate Google OAuth:', error)
    return NextResponse.redirect(
      new URL('/settings?error=google_auth_failed', request.url)
    )
  }
}
