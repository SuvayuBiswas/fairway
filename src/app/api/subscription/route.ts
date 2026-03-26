// src/app/api/subscription/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const session = await requireAuth()
    const supabase = createAdminClient()

    // FIX: Use maybeSingle() + order by created_at to get the latest row
    // .single() throws when 0 rows exist; maybeSingle() returns null safely
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('id, plan, status, amount_paise, current_period_start, current_period_end, cancel_at_period_end')
      .eq('user_id', session.sub)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[subscription GET]', error)
      throw error
    }

    return NextResponse.json({ subscription: subscription || null })
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 })
  }
}
