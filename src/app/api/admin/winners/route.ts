// src/app/api/admin/winners/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/admin/winners — all payout records
export async function GET() {
  try {
    await requireAdmin()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('prize_payouts')
      .select(`
        id, match_type, gross_amount_paise, split_amount_paise,
        proof_url, verification_status, payment_status, paid_at, admin_notes,
        created_at,
        user:profiles(id, full_name, email),
        draw:draws(month, drawn_numbers)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Generate signed URLs for proof images
    const payoutsWithUrls = await Promise.all((data || []).map(async (p) => {
      if (!p.proof_url) return p
      const { data: signed } = await supabase.storage
        .from('winner-proofs')
        .createSignedUrl(p.proof_url, 3600)
      return { ...p, proof_signed_url: signed?.signedUrl || null }
    }))

    return NextResponse.json({ payouts: payoutsWithUrls })
  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to fetch winners' }, { status: 500 })
  }
}

const VerifySchema = z.object({
  payoutId:           z.string().uuid(),
  verificationStatus: z.enum(['approved', 'rejected']),
  adminNotes:         z.string().max(500).optional(),
})

const PaySchema = z.object({
  payoutId: z.string().uuid(),
})

// PATCH /api/admin/winners — verify or mark as paid
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { action } = body

    const supabase = createAdminClient()

    if (action === 'verify') {
      const { payoutId, verificationStatus, adminNotes } = VerifySchema.parse(body)
      const { error } = await supabase
        .from('prize_payouts')
        .update({ verification_status: verificationStatus, admin_notes: adminNotes || null })
        .eq('id', payoutId)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'mark_paid') {
      const { payoutId } = PaySchema.parse(body)
      const { error } = await supabase
        .from('prize_payouts')
        .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', payoutId)
        .eq('verification_status', 'approved')  // must be approved first
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid data', issues: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
