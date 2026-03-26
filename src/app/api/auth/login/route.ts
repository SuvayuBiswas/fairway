// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { signAndSetSession } from '@/lib/auth/jwt'

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = LoginSchema.parse(body)

    // IMPORTANT: signInWithPassword MUST use the anon key client, NOT the service role.
    // The admin (service role) client does not authenticate end-users.
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await anonClient.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      console.error('[login] auth error:', error?.message)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Use admin client to fetch profile (bypasses RLS safely server-side)
    const adminClient = createAdminClient()
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileError) {
      console.error('[login] profile fetch error:', profileError.message)
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
    }
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found — please re-register' }, { status: 404 })
    }

    // Issue JWT session cookie
    await signAndSetSession({
      sub:   profile.id,
      email: data.user.email!,
      role:  profile.role as 'subscriber' | 'admin',
    })

    return NextResponse.json({
      success: true,
      role:    profile.role,
      name:    profile.full_name,
    })

  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    console.error('[login] unexpected error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
