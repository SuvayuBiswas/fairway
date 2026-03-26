// src/app/api/admin/reports/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    await requireAdmin()
    const supabase = createAdminClient()

    // Run all analytics queries in parallel
    const [
      { count: totalUsers },
      { count: activeSubscribers },
      { count: cancelledSubs },
      { data: poolData },
      { data: charityTotals },
      { data: drawStats },
      { data: monthlyGrowth },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),

      // Total prize pool paid out
      supabase.from('prize_payouts')
        .select('split_amount_paise, payment_status')
        .eq('payment_status', 'paid'),

      // Charity donation totals
      supabase.from('charity_donations')
        .select(`amount_paise, charity:charities(id, name)`),

      // Draw statistics (last 12 months)
      supabase.from('draws')
        .select(`month, total_pool_paise, jackpot_rolled, status,
          entries:draw_entries(count),
          payouts:prize_payouts(split_amount_paise, match_type)`)
        .eq('status', 'published')
        .order('month', { ascending: false })
        .limit(12),

      // Monthly subscriber growth (last 6 months)
      supabase.from('subscriptions')
        .select('created_at, status')
        .gte('created_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at'),
    ])

    // Aggregate charity totals
    const charityMap: Record<string, { name: string; totalPaise: number }> = {}
    charityTotals?.forEach(d => {
      const id = (d.charity as any)?.id
      if (!id) return
      if (!charityMap[id]) charityMap[id] = { name: (d.charity as any).name, totalPaise: 0 }
      charityMap[id].totalPaise += d.amount_paise
    })

    // Monthly growth buckets
    const growthByMonth: Record<string, number> = {}
    monthlyGrowth?.forEach(s => {
      const month = s.created_at.slice(0, 7)
      growthByMonth[month] = (growthByMonth[month] || 0) + 1
    })

    const totalPaidOut = poolData?.reduce((sum, p) => sum + p.split_amount_paise, 0) || 0
    const totalDonated = charityTotals?.reduce((sum, d) => sum + d.amount_paise, 0) || 0

    return NextResponse.json({
      overview: {
        totalUsers,
        activeSubscribers,
        cancelledSubs,
        retentionRate: totalUsers ? Math.round((activeSubscribers! / totalUsers) * 100) : 0,
        totalPaidOutPaise: totalPaidOut,
        totalDonatedPaise: totalDonated,
      },
      charityTotals: Object.entries(charityMap).map(([id, v]) => ({ id, ...v })),
      drawStats: drawStats || [],
      monthlyGrowth: growthByMonth,
    })

  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[admin/reports]', err)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
