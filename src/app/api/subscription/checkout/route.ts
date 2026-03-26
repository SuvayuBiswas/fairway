// src/app/api/subscription/checkout/route.ts
// Mock payment — no real gateway needed for demo
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

export const PLAN_AMOUNTS: Record<string, number> = {
  monthly: 90000,  // ₹900 in paise
  yearly:  790000, // ₹7900 in paise
}

const CheckoutSchema = z.object({
  plan:       z.enum(['monthly', 'yearly']),
  charityId:  z.string().uuid(),
  contribPct: z.number().int().min(10).max(100).default(10),
})

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await req.json()
    const { plan, charityId, contribPct } = CheckoutSchema.parse(body)

    const supabase = createAdminClient()

    // FIX: Use maybeSingle() — .single() throws when 0 rows exist
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', session.sub)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (existingSub) {
      return NextResponse.json({ error: 'You already have an active subscription' }, { status: 409 })
    }

    // Return mock order details — client shows card form
    return NextResponse.json({
      mockOrderId: `mock_${Date.now()}`,
      amount:      PLAN_AMOUNTS[plan],
      plan,
      charityId,
      contribPct,
      currency: 'INR',
    })

  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', issues: err.issues }, { status: 400 })
    console.error('[checkout]', err)
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
  }
}
