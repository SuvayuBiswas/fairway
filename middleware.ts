// middleware.ts — runs on every request
import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionFromRequest } from '@/lib/auth/jwt'

// Routes that require authentication
const PROTECTED_ROUTES = ['/dashboard', '/api/scores', '/api/draw', '/api/charity', '/api/subscription']
const ADMIN_ROUTES = ['/admin', '/api/admin']
const AUTH_ROUTES = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 1. HTTPS Enforcement (production) ──────────────────────
  if (
    process.env.NODE_ENV === 'production' &&
    request.headers.get('x-forwarded-proto') === 'http'
  ) {
    const httpsUrl = request.nextUrl.clone()
    httpsUrl.protocol = 'https'
    return NextResponse.redirect(httpsUrl, { status: 301 })
  }

  // ── 2. Verify JWT session ──────────────────────────────────
  const session = await verifySessionFromRequest(request)

  // ── 3. Guard protected user routes ────────────────────────
  const isProtected = PROTECTED_ROUTES.some(r => pathname.startsWith(r))
  if (isProtected && !session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── 4. Guard admin routes ──────────────────────────────────
  const isAdmin = ADMIN_ROUTES.some(r => pathname.startsWith(r))
  if (isAdmin) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (session.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // ── 5. Redirect logged-in users away from auth pages ───────
  const isAuthRoute = AUTH_ROUTES.some(r => pathname.startsWith(r))
  if (isAuthRoute && session) {
    const dest = session.role === 'admin' ? '/admin' : '/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // ── 6. Inject user info into request headers (for API routes)
  const response = NextResponse.next()
  if (session) {
    response.headers.set('x-user-id', session.sub)
    response.headers.set('x-user-role', session.role)
    response.headers.set('x-user-email', session.email)
  }

  // ── 7. Security headers ────────────────────────────────────
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
