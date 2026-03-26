// src/app/api/webhooks/razorpay/route.ts
// Razorpay webhook handler for subscription lifecycle events
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { calculateCharityAmount, PLAN_AMOUNTS } from '@/lib/razorpay'

export const runtime = 'nodejs'

function verifyWebhookSignature(body: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
  if (!webhookSecret) return true // skip verification in dev/demo mode
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex')
  return expectedSignature === signature
}

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''

  if (!verifyWebhookSignature(body, signature)) {
    console.error('[rzp-webhook] Signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event    = JSON.parse(body)
  const supabase = createAdminClient()

  try {
    const { event: eventType, payload } = event

    switch (eventType) {

      // ── Subscription activated ──────────────────────────────
      case 'subscription.activated': {
        const sub        = payload.subscription.entity
        const notes      = sub.notes || {}
        const userId     = notes.supabase_user_id
        const charityId  = notes.charity_id
        const contribPct = parseInt(notes.contrib_pct || '10')
        const plan       = notes.plan as 'monthly' | 'yearly'
        if (!userId) break

        const amount = PLAN_AMOUNTS[plan] || PLAN_AMOUNTS.monthly

        // onConflict on razorpay_subscription_id IS safe — that column is UNIQUE
        await supabase.from('subscriptions').upsert({
          user_id:                  userId,
          razorpay_subscription_id: sub.id,
          razorpay_customer_id:     sub.customer_id || null,
          plan,
          status:                   'active',
          amount_paise:             amount,
          current_period_start:     sub.current_start ? new Date(sub.current_start * 1000).toISOString() : new Date().toISOString(),
          current_period_end:       sub.current_end   ? new Date(sub.current_end   * 1000).toISOString() : null,
        }, { onConflict: 'razorpay_subscription_id' })

        await supabase.from('profiles').update({
          charity_id:  charityId,
          contrib_pct: contribPct,
        }).eq('id', userId)
        break
      }

      // ── Payment captured ────────────────────────────────────
      case 'payment.captured': {
        const payment        = payload.payment.entity
        const subscriptionId = payment.subscription_id
        if (!subscriptionId) break

        // FIX: maybeSingle — subscription may not exist yet in race conditions
        const { data: subRecord } = await supabase
          .from('subscriptions')
          .select('user_id, amount_paise, status')
          .eq('razorpay_subscription_id', subscriptionId)
          .maybeSingle()

        if (!subRecord) break

        await supabase.from('subscriptions').update({
          status: 'active',
        }).eq('razorpay_subscription_id', subscriptionId)

        // FIX: maybeSingle — profile should exist but be safe
        const { data: profile } = await supabase
          .from('profiles')
          .select('charity_id, contrib_pct')
          .eq('id', subRecord.user_id)
          .maybeSingle()

        if (profile?.charity_id) {
          const donationAmount = calculateCharityAmount(subRecord.amount_paise, profile.contrib_pct)
          const month          = new Date().toISOString().slice(0, 7)

          // FIX: maybeSingle — donation may not exist yet
          const { data: existing } = await supabase
            .from('charity_donations')
            .select('id')
            .eq('user_id', subRecord.user_id)
            .eq('month', month)
            .maybeSingle()

          if (!existing) {
            await supabase.from('charity_donations').insert({
              user_id:      subRecord.user_id,
              charity_id:   profile.charity_id,
              amount_paise: donationAmount,
              month,
            })
          }
        }
        break
      }

      // ── Subscription charged (renewal) ─────────────────────
      case 'subscription.charged': {
        const sub = payload.subscription.entity
        await supabase.from('subscriptions').update({
          status:               'active',
          current_period_start: sub.current_start ? new Date(sub.current_start * 1000).toISOString() : undefined,
          current_period_end:   sub.current_end   ? new Date(sub.current_end   * 1000).toISOString() : undefined,
        }).eq('razorpay_subscription_id', sub.id)
        break
      }

      // ── Subscription cancelled ─────────────────────────────
      case 'subscription.cancelled': {
        const sub = payload.subscription.entity
        await supabase.from('subscriptions').update({ status: 'cancelled' })
          .eq('razorpay_subscription_id', sub.id)
        break
      }

      // ── Subscription paused ────────────────────────────────
      case 'subscription.paused': {
        const sub = payload.subscription.entity
        await supabase.from('subscriptions').update({ status: 'lapsed' })
          .eq('razorpay_subscription_id', sub.id)
        break
      }

      // ── Payment failed ─────────────────────────────────────
      case 'payment.failed': {
        const payment = payload.payment.entity
        if (!payment.subscription_id) break
        await supabase.from('subscriptions').update({ status: 'past_due' })
          .eq('razorpay_subscription_id', payment.subscription_id)
        break
      }

      default:
        console.log(`[rzp-webhook] Unhandled event: ${eventType}`)
    }

    return NextResponse.json({ received: true })

  } catch (err) {
    console.error('[rzp-webhook] Handler error:', err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
