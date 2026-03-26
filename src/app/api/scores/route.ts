// src/app/api/scores/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/jwt'

const AddScoreSchema = z.object({
  score:     z.number().int().min(1).max(45),
  played_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// GET /api/scores
export async function GET() {
  try {
    const session = await requireAuth()
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('golf_scores')
      .select('id, score, played_at, created_at')
      .eq('user_id', session.sub)
      .order('played_at', { ascending: false })
      .limit(5)

    if (error) throw error
    return NextResponse.json({ scores: data || [] })
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to fetch scores' }, { status: 500 })
  }
}

// POST /api/scores
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await req.json()
    const { score, played_at } = AddScoreSchema.parse(body)

    const supabase = createAdminClient()

    // FIX: Use maybeSingle() — .single() throws on 0 rows
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', session.sub)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (!sub) {
      return NextResponse.json({ error: 'Active subscription required to add scores' }, { status: 403 })
    }

    if (new Date(played_at) > new Date()) {
      return NextResponse.json({ error: 'Score date cannot be in the future' }, { status: 400 })
    }

    // Insert — DB trigger enforces rolling 5 limit
    // FIX: Don't use .single() on insert — use select() then grab first item
    const { data: inserted, error: insertError } = await supabase
      .from('golf_scores')
      .insert({ user_id: session.sub, score, played_at })
      .select()

    if (insertError) throw insertError

    // Fetch updated list
    const { data: updatedScores } = await supabase
      .from('golf_scores')
      .select('id, score, played_at, created_at')
      .eq('user_id', session.sub)
      .order('played_at', { ascending: false })
      .limit(5)

    return NextResponse.json({ score: inserted?.[0] || null, scores: updatedScores || [] })
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid score data', issues: err.issues }, { status: 400 })
    console.error('[scores POST]', err)
    return NextResponse.json({ error: 'Failed to add score' }, { status: 500 })
  }
}

// DELETE /api/scores?id=uuid
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Score ID required' }, { status: 400 })

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('golf_scores')
      .delete()
      .eq('id', id)
      .eq('user_id', session.sub)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'Failed to delete score' }, { status: 500 })
  }
}
