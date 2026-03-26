// src/lib/auth/jwt.ts
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)
const COOKIE_NAME = 'fairway_session'
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',  // HTTPS in prod
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7,  // 7 days
  path: '/',
}

export interface JWTPayload {
  sub: string          // user UUID
  email: string
  role: 'subscriber' | 'admin'
  iat?: number
  exp?: number
}

// Sign a JWT and set it as an httpOnly cookie
export async function signAndSetSession(payload: Omit<JWTPayload, 'iat' | 'exp'>) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)

  const cookieStore = cookies()
  ;(cookieStore as any).set(COOKIE_NAME, token, COOKIE_OPTIONS)
  return token
}

// Verify JWT from cookies (server components / route handlers)
export async function getSession(): Promise<JWTPayload | null> {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as JWTPayload
  } catch {
    return null
  }
}

// Verify JWT from request (middleware)
export async function verifySessionFromRequest(req: NextRequest): Promise<JWTPayload | null> {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as JWTPayload
  } catch {
    return null
  }
}

// Clear session cookie (logout)
export async function clearSession() {
  const cookieStore = cookies()
  ;(cookieStore as any).set(COOKIE_NAME, '', { ...COOKIE_OPTIONS, maxAge: 0 })
}

// Require auth — throws if not authenticated
export async function requireAuth(): Promise<JWTPayload> {
  const session = await getSession()
  if (!session) throw new Error('UNAUTHENTICATED')
  return session
}

// Require admin role
export async function requireAdmin(): Promise<JWTPayload> {
  const session = await requireAuth()
  if (session.role !== 'admin') throw new Error('FORBIDDEN')
  return session
}
