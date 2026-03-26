// src/app/api/subscription/verify/route.ts
// Mock payment verification — activates subscription directly in DB
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

const PLAN_AMOUNTS: Record<string, number> = {
  monthly: 90000,   // ₹900 in paise
  yearly:  790000,  // ₹7900 in paise
}

const VerifySchema = z.object({
  mockOrderId: z.string(),
  plan:        z.enum(['monthly', 'yearly']),
  charityId:   z.string().uuid(),
  contribPct:  z.number().int().min(10).max(100),
})

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const body    = await req.json()
    const { plan, charityId, contribPct } = VerifySchema.parse(body)

    const supabase = createAdminClient()
    const amount   = PLAN_AMOUNTS[plan]
    const now      = new Date()
    const periodEnd = new Date(now)
    if (plan === 'monthly') periodEnd.setMonth(periodEnd.getMonth() + 1)
    else                    periodEnd.setFullYear(periodEnd.getFullYear() + 1)

    // ── FIX 1: Cannot use onConflict:'user_id' — no UNIQUE constraint.
    // Check for existing row, then UPDATE or INSERT.
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', session.sub)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingSub) {
      const { error: updateErr } = await supabase
        .from('subscriptions')
        .update({
          plan,
          status:               'active',
          amount_paise:         amount,
          current_period_start: now.toISOString(),
          current_period_end:   periodEnd.toISOString(),
          cancel_at_period_end: false,
        })
        .eq('id', existingSub.id)

      if (updateErr) {
        console.error('[verify] subscription update error:', updateErr)
        return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
      }
    } else {
      const { error: insertErr } = await supabase
        .from('subscriptions')
        .insert({
          user_id:              session.sub,
          plan,
          status:               'active',
          amount_paise:         amount,
          current_period_start: now.toISOString(),
          current_period_end:   periodEnd.toISOString(),
          cancel_at_period_end: false,
        })

      if (insertErr) {
        console.error('[verify] subscription insert error:', insertErr)
        return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
      }
    }

    // Update profile with charity + contribution
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ charity_id: charityId, contrib_pct: contribPct })
      .eq('id', session.sub)

    if (profileErr) console.error('[verify] profile update error:', profileErr)

    // Record charity donation for this month (idempotent)
    const donationAmount = Math.floor(amount * (contribPct / 100))
    const month          = now.toISOString().slice(0, 7)

    const { data: existingDonation } = await supabase
      .from('charity_donations')
      .select('id')
      .eq('user_id', session.sub)
      .eq('month', month)
      .maybeSingle()

    if (!existingDonation) {
      await supabase.from('charity_donations').insert({
        user_id:      session.sub,
        charity_id:   charityId,
        amount_paise: donationAmount,
        month,
      })
    }

    return NextResponse.json({ success: true, message: 'Subscription activated' })

  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (err instanceof z.ZodError)         return NextResponse.json({ error: 'Invalid data', issues: err.issues }, { status: 400 })
    console.error('[verify] unexpected error:', err)
    return NextResponse.json({ error: 'Activation failed' }, { status: 500 })
  }
}
