// src/app/api/admin/draw/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'
import { randomDraw, algorithmicDraw, processDraw } from '@/lib/draw-engine'
import { calculatePrizePool as calcPool } from '@/lib/razorpay'

// GET /api/admin/draw — list all draws
export async function GET() {
  try {
    await requireAdmin()
    const supabase = createAdminClient()

    const { data: draws, error } = await supabase
      .from('draws')
      .select('*')
      .order('month', { ascending: false })
      .limit(12)

    if (error) throw error

    // Get active subscriber count for prize pool calculation
    const { count: activeCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')

    const pool = calcPool(activeCount || 0)

    return NextResponse.json({ draws, pool, activeSubscribers: activeCount })
  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to fetch draws' }, { status: 500 })
  }
}

const SimulateSchema = z.object({
  month:     z.string().regex(/^\d{4}-\d{2}$/),
  drawLogic: z.enum(['random', 'algorithmic']),
})

// POST /api/admin/draw/simulate — run a simulation without publishing
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { action } = body

    const supabase = createAdminClient()

    if (action === 'simulate') {
      const { month, drawLogic } = SimulateSchema.parse(body)

      // Get all active users' scores
      const { data: allScores } = await supabase
        .from('golf_scores')
        .select('user_id, score')
        .order('user_id')

      const userScoreMap: Record<string, number[]> = {}
      allScores?.forEach(s => {
        if (!userScoreMap[s.user_id]) userScoreMap[s.user_id] = []
        userScoreMap[s.user_id].push(s.score)
      })

      const allUserArrays = Object.values(userScoreMap)
      const drawnNumbers = drawLogic === 'algorithmic'
        ? algorithmicDraw(allUserArrays)
        : randomDraw()

      // Count potential winners (simulation only — not saved)
      const entries = Object.entries(userScoreMap).map(([userId, numbers]) => ({
        userId,
        numbers,
      }))

      const { count: activeCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')

      const pool = calcPool(activeCount || 0)
      const result = processDraw({
        drawnNumbers,
        entries,
        totalPoolPaise: pool.totalPaise,
      })

      return NextResponse.json({
        simulation: true,
        drawnNumbers,
        winners: {
          fiveMatch:   result.winners.filter(w => w.matchType === '5_match').length,
          fourMatch:   result.winners.filter(w => w.matchType === '4_match').length,
          threeMatch:  result.winners.filter(w => w.matchType === '3_match').length,
        },
        jackpotWon: result.jackpotWon,
        pool,
      })
    }

    if (action === 'publish') {
      const { month, drawLogic, drawnNumbers: providedNumbers } = body

      // Get previous month's jackpot carry
      const prevMonth = getPrevMonth(month)
      const { data: prevDraw } = await supabase
        .from('draws')
        .select('jackpot_rolled, jackpot_carry_paise')
        .eq('month', prevMonth)
        .maybeSingle()

      const jackpotCarry = prevDraw?.jackpot_rolled ? (prevDraw.jackpot_carry_paise || 0) : 0

      // Get active subscriber count
      const { count: activeCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')

      const pool = calcPool(activeCount || 0)
      const totalPoolPaise = pool.totalPaise + jackpotCarry

      // Determine drawn numbers
      let drawnNumbers: number[]
      if (providedNumbers && providedNumbers.length === 5) {
        drawnNumbers = providedNumbers
      } else {
        // Get all user scores for algorithmic draw
        const { data: allScores } = await supabase
          .from('golf_scores')
          .select('user_id, score')

        const userArrays: number[][] = []
        const userMap: Record<string, number[]> = {}
        allScores?.forEach(s => {
          if (!userMap[s.user_id]) userMap[s.user_id] = []
          userMap[s.user_id].push(s.score)
        })
        Object.values(userMap).forEach(arr => userArrays.push(arr))

        drawnNumbers = drawLogic === 'algorithmic'
          ? algorithmicDraw(userArrays)
          : randomDraw()
      }

      // Create draw record
      const { data: draw, error: drawError } = await supabase
        .from('draws')
        .upsert({
          month,
          draw_logic:       drawLogic || 'random',
          status:           'published',
          drawn_numbers:    drawnNumbers,
          total_pool_paise: totalPoolPaise,
          jackpot_carry_paise: jackpotCarry,
          published_at:     new Date().toISOString(),
        }, { onConflict: 'month' })
        .select()
        .maybeSingle()

      if (drawError) throw drawError

      // Create draw entries for all active subscribers with 5 scores
      const { data: eligibleUsers } = await supabase
        .from('golf_scores')
        .select('user_id, score')

      const userScoreMap: Record<string, number[]> = {}
      eligibleUsers?.forEach(s => {
        if (!userScoreMap[s.user_id]) userScoreMap[s.user_id] = []
        userScoreMap[s.user_id].push(s.score)
      })

      const entries = Object.entries(userScoreMap)
        .filter(([_, nums]) => nums.length === 5)
        .map(([userId, numbers]) => ({ userId, numbers }))

      // Process draw
      const result = processDraw({ drawnNumbers, entries, totalPoolPaise, jackpotCarryPaise: jackpotCarry })

      // Bulk insert draw entries
      if (entries.length > 0) {
        const entryRows = entries.map(e => ({
          draw_id:     draw.id,
          user_id:     e.userId,
          numbers:     e.numbers,
          match_count: result.winners.find(w => w.userId === e.userId)?.matchCount || 0,
          is_winner:   result.winners.some(w => w.userId === e.userId),
        }))
        await supabase.from('draw_entries').insert(entryRows)
      }

      // Create payout records for winners
      if (result.payouts.length > 0) {
        const payoutRows = result.payouts.map(p => {
          const entry = entries.find(e => e.userId === p.userId)
          return {
            draw_id:           draw.id,
            user_id:           p.userId,
            draw_entry_id:     draw.id,  // will be updated after entry insert in prod
            match_type:        p.matchType,
            gross_amount_paise: p.grossAmountPaise,
            split_amount_paise: p.splitAmountPaise,
          }
        })
        await supabase.from('prize_payouts').insert(payoutRows)
      }

      // Update jackpot rollover status
      await supabase.from('draws').update({
        jackpot_rolled: !result.jackpotWon,
        jackpot_carry_paise: result.newJackpotCarry,
      }).eq('id', draw.id)

      return NextResponse.json({
        success: true,
        drawId:     draw.id,
        drawnNumbers,
        winners:    result.winners.length,
        jackpotWon: result.jackpotWon,
        newJackpotCarry: result.newJackpotCarry,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[admin/draw]', err)
    return NextResponse.json({ error: 'Draw operation failed' }, { status: 500 })
  }
}

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}
