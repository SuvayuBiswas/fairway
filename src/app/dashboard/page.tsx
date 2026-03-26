// src/app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'
import UserDashboard from '@/components/UserDashboard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { checkout?: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role === 'admin') redirect('/admin')

  const supabase = createAdminClient()

  // FIX: All .single() replaced with .maybeSingle() to prevent throws on 0 rows.
  // Profile uses .single() intentionally — if profile is missing something is wrong.
  const [
    profileRes,
    scoresRes,
    subscriptionRes,
    charitiesRes,
    donationsRes,
    payoutsRes,
    currentDrawRes,
    drawEntriesRes,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, contrib_pct, charity:charities(id, name, slug)')
      .eq('id', session.sub)
      .maybeSingle(),

    supabase
      .from('golf_scores')
      .select('id, score, played_at')
      .eq('user_id', session.sub)
      .order('played_at', { ascending: false })
      .limit(5),

    // FIX: maybeSingle — new user has no subscription yet
    supabase
      .from('subscriptions')
      .select('id, plan, status, amount_paise, current_period_start, current_period_end, cancel_at_period_end')
      .eq('user_id', session.sub)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('charities')
      .select('id, name, slug, is_featured')
      .eq('is_active', true)
      .order('is_featured', { ascending: false }),

    supabase
      .from('charity_donations')
      .select('amount_paise, month, charity:charities(name)')
      .eq('user_id', session.sub)
      .order('month', { ascending: false })
      .limit(6),

    supabase
      .from('prize_payouts')
      .select('id, match_type, split_amount_paise, payment_status, verification_status, proof_url, paid_at, draw:draws(month)')
      .eq('user_id', session.sub)
      .order('created_at', { ascending: false }),

    // FIX: maybeSingle — no draw exists until admin creates one
    supabase
      .from('draws')
      .select('id, month, drawn_numbers, status, total_pool_paise, jackpot_carry_paise, published_at')
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('draw_entries')
      .select('id, numbers, match_count, is_winner, draw:draws(month, drawn_numbers, status)')
      .eq('user_id', session.sub)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  // If profile is genuinely missing, redirect to login so they can re-register
  if (!profileRes.data) redirect('/login')

  // Supabase foreign-key joins always return an array; normalise to object | null
  const rawProfile = profileRes.data
  const profile = {
    ...rawProfile,
    charity: Array.isArray(rawProfile.charity)
      ? (rawProfile.charity[0] ?? null)
      : (rawProfile.charity ?? null),
  }

  return (
    <UserDashboard
      user={session}
      profile={profile}
      scores={scoresRes.data || []}
      subscription={subscriptionRes.data || null}
      charities={charitiesRes.data || []}
      donations={donationsRes.data || []}
      payouts={payoutsRes.data || []}
      currentDraw={currentDrawRes.data || null}
      drawEntries={drawEntriesRes.data || []}
      checkoutStatus={searchParams.checkout}
    />
  )
}
