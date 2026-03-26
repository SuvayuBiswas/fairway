// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { signAndSetSession } from '@/lib/auth/jwt'
import bcrypt from 'bcryptjs'

const RegisterSchema = z.object({
  fullName:   z.string().min(2).max(100),
  email:      z.string().email(),
  password:   z.string().min(8).max(128),
  charityId:  z.string().uuid(),
  contribPct: z.number().int().min(10).max(100).default(10),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = RegisterSchema.parse(body)

    const supabase = createAdminClient()

    // 1. Register user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,  // auto-confirm for now; set false in prod to require email verify
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
      }
      throw authError
    }

    const userId = authData.user.id

    // 2. Create profile record
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id:          userId,
        full_name:   data.fullName,
        email:       data.email,
        role:        'subscriber',
        charity_id:  data.charityId,
        contrib_pct: data.contribPct,
      })

    if (profileError) throw profileError

    // 3. Issue JWT session cookie
    await signAndSetSession({
      sub:   userId,
      email: data.email,
      role:  'subscriber',
    })

    return NextResponse.json({
      success: true,
      userId,
      message: 'Account created successfully',
    })

  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.issues }, { status: 400 })
    }
    console.error('[register]', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
