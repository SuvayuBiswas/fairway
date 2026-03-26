// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/admin/users — list all users with subscription status
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('q') || ''
    const page   = parseInt(searchParams.get('page') || '1')
    const limit  = 20
    const offset = (page - 1) * limit

    const supabase = createAdminClient()

    let query = supabase
      .from('profiles')
      .select(`
        id, full_name, email, role, contrib_pct, created_at,
        charity:charities(id, name),
        subscription:subscriptions(plan, status, amount_paise, current_period_end)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({ users: data, total: count, page, limit })
  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

const UpdateUserSchema = z.object({
  userId:     z.string().uuid(),
  fullName:   z.string().min(2).optional(),
  charityId:  z.string().uuid().optional(),
  contribPct: z.number().int().min(10).max(100).optional(),
  role:       z.enum(['subscriber', 'admin']).optional(),
})

// PATCH /api/admin/users — admin edits a user
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { userId, ...updates } = UpdateUserSchema.parse(body)

    const supabase = createAdminClient()
    const updateData: Record<string, any> = {}
    if (updates.fullName)   updateData.full_name   = updates.fullName
    if (updates.charityId)  updateData.charity_id  = updates.charityId
    if (updates.contribPct) updateData.contrib_pct = updates.contribPct
    if (updates.role)       updateData.role        = updates.role

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid data', issues: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
