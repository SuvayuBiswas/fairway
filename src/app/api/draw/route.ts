// src/app/api/draw/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const session = await requireAuth()
    const supabase = createAdminClient()

    // FIX: maybeSingle() — no draw rows exist until admin publishes first one
    const { data: currentDraw } = await supabase
      .from('draws')
      .select('id, month, drawn_numbers, status, total_pool_paise, jackpot_carry_paise, published_at')
      .in('status', ['published', 'pending'])
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: entries } = await supabase
      .from('draw_entries')
      .select(`
        id, numbers, match_count, is_winner, created_at,
        draw:draws(month, drawn_numbers, status, published_at)
      `)
      .eq('user_id', session.sub)
      .order('created_at', { ascending: false })
      .limit(6)

    const { data: payouts } = await supabase
      .from('prize_payouts')
      .select(`
        id, match_type, split_amount_paise, payment_status, verification_status, proof_url, paid_at,
        draw:draws(month)
      `)
      .eq('user_id', session.sub)
      .order('created_at', { ascending: false })

    const { data: scores } = await supabase
      .from('golf_scores')
      .select('score, played_at')
      .eq('user_id', session.sub)
      .order('played_at', { ascending: false })
      .limit(5)

    return NextResponse.json({
      currentDraw: currentDraw || null,
      entries:     entries || [],
      payouts:     payouts || [],
      currentNumbers: scores?.map(s => s.score) || [],
    })

  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch draw data' }, { status: 500 })
  }
}
