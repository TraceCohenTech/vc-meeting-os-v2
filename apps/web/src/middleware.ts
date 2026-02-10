import { NextResponse, type NextRequest } from 'next/server'

// Dynamically import to avoid Edge runtime issues
async function getSupabaseUser(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase env vars')
      return { user: null, response: NextResponse.next({ request }) }
    }

    const { createServerClient } = await import('@supabase/ssr')

    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    })

    const { data } = await supabase.auth.getUser()
    return { user: data.user, response: supabaseResponse }
  } catch (error) {
    console.error('Middleware auth error:', error)
    return { user: null, response: NextResponse.next({ request }) }
  }
}

export async function middleware(request: NextRequest) {
  // Handle OAuth code - redirect to auth callback if code is present at root
  const code = request.nextUrl.searchParams.get('code')
  if (code && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  const { user, response } = await getSupabaseUser(request)

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ['/dashboard', '/companies', '/memos', '/tasks', '/chat', '/settings', '/folders']
  const isProtectedPath = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from login page
  if (request.nextUrl.pathname === '/login' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
