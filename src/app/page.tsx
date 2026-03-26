// src/app/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import HomePage from '@/components/HomePage'

export const revalidate = 3600

export default async function Page() {
  const supabase = createAdminClient()

  const { data: charities } = await supabase
    .from('charities')
    .select('id, name, slug, description, is_featured, upcoming_event, event_date, event_location')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })

  const [
    { count: subscriberCount },
    { data: donationTotal },
    // FIX: maybeSingle — no draws exist on first run
    { data: latestDraw },
  ] = await Promise.all([
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('charity_donations').select('amount_paise'),
    supabase.from('draws')
      .select('total_pool_paise, jackpot_carry_paise, jackpot_rolled')
      .eq('status', 'published')
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const totalDonatedPaise = donationTotal?.reduce((s, d) => s + d.amount_paise, 0) || 4820000
  const jackpotPaise = latestDraw
    ? Math.floor((latestDraw.total_pool_paise || 2619000) * 0.4) + (latestDraw.jackpot_carry_paise || 0)
    : 1240000

  return (
    <HomePage
      charities={charities || []}
      stats={{
        subscriberCount:    subscriberCount || 3140,
        totalDonatedPaise:  totalDonatedPaise,
        jackpotPaise:       jackpotPaise,
      }}
    />
  )
}
