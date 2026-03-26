// src/app/api/charity/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/jwt'

// GET /api/charity — public list of active charities
export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('charities')
      .select('id, name, slug, description, is_featured, upcoming_event, event_date, event_location')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('name')

    if (error) throw error
    return NextResponse.json({ charities: data })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch charities' }, { status: 500 })
  }
}

// PATCH /api/charity — update logged-in user's charity + contrib pct
const UpdateSchema = z.object({
  charityId:  z.string().uuid().optional(),
  contribPct: z.number().int().min(10).max(100).optional(),
})

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await req.json()
    const updates = UpdateSchema.parse(body)

    if (!updates.charityId && !updates.contribPct) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const updateData: Record<string, any> = {}
    if (updates.charityId)  updateData.charity_id  = updates.charityId
    if (updates.contribPct) updateData.contrib_pct = updates.contribPct

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', session.sub)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request', issues: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Failed to update charity' }, { status: 500 })
  }
}
