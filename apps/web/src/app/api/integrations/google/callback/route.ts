import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { exchangeCodeForTokens, getGoogleDriveClient, ensureDealFlowFolder } from '@/lib/google/drive'

/**
 * GET /api/integrations/google/callback
 * Handles the OAuth callback from Google
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') // User ID
    const error = searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      console.error('Google OAuth error:', error)
      return NextResponse.redirect(
        new URL(`/settings?error=google_auth_denied&message=${encodeURIComponent(error)}`, request.url)
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/settings?error=google_auth_invalid', request.url)
      )
    }

    const userId = state
    const adminClient = createAdminClient()

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    if (!tokens.access_token) {
      return NextResponse.redirect(
        new URL('/settings?error=google_token_failed', request.url)
      )
    }

    // Initialize Drive client and ensure folder exists
    let folderId: string | undefined
    try {
      const drive = getGoogleDriveClient(tokens.access_token)
      folderId = await ensureDealFlowFolder(drive)
    } catch (driveError) {
      console.error('Failed to create Deal Flow folder:', driveError)
      // Continue anyway - folder can be created later
    }

    // Check for existing Google integration
    const { data: existingIntegration } = await (adminClient
      .from('integrations') as ReturnType<typeof adminClient.from>)
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single() as unknown as { data: { id: string } | null }

    const credentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope,
      drive_folder_id: folderId,
    }

    if (existingIntegration) {
      // Update existing integration
      await (adminClient.from('integrations') as ReturnType<typeof adminClient.from>)
        .update({
          credentials,
          status: 'active',
          error_message: null,
          last_sync_at: new Date().toISOString(),
        } as never)
        .eq('id', existingIntegration.id)
    } else {
      // Create new integration
      await (adminClient.from('integrations') as ReturnType<typeof adminClient.from>)
        .insert({
          user_id: userId,
          provider: 'google',
          credentials,
          status: 'active',
          error_message: null,
          last_sync_at: new Date().toISOString(),
        } as never)
    }

    // Redirect back to settings with success message
    return NextResponse.redirect(
      new URL('/settings?success=google_connected', request.url)
    )
  } catch (error) {
    console.error('Google OAuth callback error:', error)
    return NextResponse.redirect(
      new URL('/settings?error=google_callback_failed', request.url)
    )
  }
}
