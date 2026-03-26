// src/app/api/winners/upload-proof/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const session  = await requireAuth()
    const formData = await req.formData()
    const file     = formData.get('proof') as File | null
    const payoutId = formData.get('payout_id') as string | null

    if (!file || !payoutId) {
      return NextResponse.json({ error: 'proof file and payout_id are required' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP or GIF files are accepted' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // FIX: maybeSingle() — payout may not exist, should return 404 not throw
    const { data: payout } = await supabase
      .from('prize_payouts')
      .select('id, verification_status')
      .eq('id', payoutId)
      .eq('user_id', session.sub)
      .maybeSingle()

    if (!payout) return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    if (payout.verification_status !== 'pending') {
      return NextResponse.json({ error: 'Proof already submitted' }, { status: 409 })
    }

    const ext  = file.name.split('.').pop() || 'jpg'
    const path = `${session.sub}/${payoutId}.${ext}`
    const buf  = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('winner-proofs')
      .upload(path, buf, { contentType: file.type, upsert: true })

    if (uploadError) throw uploadError

    const { data: signed } = await supabase.storage
      .from('winner-proofs')
      .createSignedUrl(path, 60 * 60 * 24 * 30)

    await supabase.from('prize_payouts').update({ proof_url: path }).eq('id', payoutId)

    return NextResponse.json({ success: true, proofUrl: signed?.signedUrl || null })

  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[upload-proof]', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
