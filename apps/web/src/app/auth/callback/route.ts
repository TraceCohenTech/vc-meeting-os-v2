import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureDealFlowFolder, getGoogleDriveClient } from '@/lib/google/drive'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user && data.session) {
      // Ensure profile exists in database
      const adminClient = createAdminClient()

      // Check if profile exists
      const { data: existingProfile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single()

      // Create profile if it doesn't exist
      if (!existingProfile) {
        const { error: profileError } = await (adminClient.from('profiles') as ReturnType<typeof adminClient.from>).insert({
          id: data.user.id,
          email: data.user.email,
          display_name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
          avatar_url: data.user.user_metadata?.avatar_url,
        } as never)

        if (profileError) {
          console.error('Error creating profile:', profileError)
        }

        // Create default folder for new users
        await (adminClient.from('folders') as ReturnType<typeof adminClient.from>).insert({
          user_id: data.user.id,
          name: 'General',
          color: '#6366f1',
          is_default: true,
          sort_order: 0,
        } as never)
      }

      // Save Google tokens for Drive access if provider token is available
      const providerToken = data.session.provider_token
      const providerRefreshToken = data.session.provider_refresh_token

      if (providerToken) {
        try {
          // Try to create Drive folder to verify token works
          let folderId: string | undefined
          try {
            const drive = getGoogleDriveClient(providerToken)
            folderId = await ensureDealFlowFolder(drive)
          } catch (driveError) {
            console.log('Could not create Drive folder (may not have Drive scope):', driveError)
          }

          // Check for existing Google integration
          const { data: existingIntegration } = await (adminClient
            .from('integrations') as ReturnType<typeof adminClient.from>)
            .select('id')
            .eq('user_id', data.user.id)
            .eq('provider', 'google')
            .single() as unknown as { data: { id: string } | null }

          const credentials = {
            access_token: providerToken,
            refresh_token: providerRefreshToken || null,
            drive_folder_id: folderId || null,
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
                user_id: data.user.id,
                provider: 'google',
                credentials,
                status: 'active',
                error_message: null,
                last_sync_at: new Date().toISOString(),
              } as never)
          }

          console.log('Google Drive integration saved for user:', data.user.id)
        } catch (integrationError) {
          console.error('Error saving Google integration:', integrationError)
          // Don't fail login if integration save fails
        }
      }

      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // Auth error - redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
