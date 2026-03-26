// src/app/api/subscription/cancel/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const session = await requireAuth()
    const supabase = createAdminClient()

    // FIX: maybeSingle() — no throw on 0 rows
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', session.sub)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (!sub) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('subscriptions')
      .update({ cancel_at_period_end: true })
      .eq('id', sub.id)

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Subscription will cancel at end of billing period' })

  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[cancel]', err)
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 })
  }
}
