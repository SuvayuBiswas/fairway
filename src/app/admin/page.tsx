// src/app/admin/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'
import AdminDashboard from '@/components/AdminDashboard'
// FIX: import from razorpay lib (the actual file in this project)
import { calculatePrizePool } from '@/lib/razorpay'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  const supabase = createAdminClient()

  const [
    { data: users, count: totalUsers },
    { count: activeCount },
    { data: draws },
    { data: charities },
    { data: payouts },
    { data: charityTotals },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(`
        id, full_name, email, role, contrib_pct, created_at,
        charity:charities(id, name),
        subscription:subscriptions(plan, status, current_period_end)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(50),

    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),

    supabase
      .from('draws')
      .select('*')
      .order('month', { ascending: false })
      .limit(12),

    supabase
      .from('charities')
      .select(`
        id, name, slug, is_featured, is_active,
        members:profiles(count),
        donations:charity_donations(amount_paise)
      `)
      .order('is_featured', { ascending: false }),

    supabase
      .from('prize_payouts')
      .select(`
        id, match_type, gross_amount_paise, split_amount_paise,
        proof_url, verification_status, payment_status, paid_at, admin_notes, created_at,
        user:profiles(id, full_name, email),
        draw:draws(month, drawn_numbers)
      `)
      .order('created_at', { ascending: false }),

    supabase
      .from('charity_donations')
      .select('amount_paise'),
  ])

  const pool        = calculatePrizePool(activeCount || 0)
  const totalDonated = charityTotals?.reduce((s, d) => s + d.amount_paise, 0) || 0
  const totalPaidOut = payouts?.filter(p => p.payment_status === 'paid')
    .reduce((s, p) => s + p.split_amount_paise, 0) || 0

  return (
    <AdminDashboard
      users={users || []}
      totalUsers={totalUsers || 0}
      activeSubscribers={activeCount || 0}
      draws={draws || []}
      charities={charities || []}
      payouts={payouts || []}
      pool={pool}
      totalDonatedPaise={totalDonated}
      totalPaidOutPaise={totalPaidOut}
    />
  )
}
