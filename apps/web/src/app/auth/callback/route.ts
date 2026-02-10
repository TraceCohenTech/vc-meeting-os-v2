import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
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

      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // Auth error - redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
