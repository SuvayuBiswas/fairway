// src/app/api/admin/charities/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/jwt'
import { createAdminClient } from '@/lib/supabase/server'

const CharitySchema = z.object({
  name:           z.string().min(2).max(200),
  slug:           z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  description:    z.string().max(1000).optional(),
  website_url:    z.string().url().optional().or(z.literal('')),
  is_featured:    z.boolean().default(false),
  upcoming_event: z.string().max(200).optional().or(z.literal('')),
  event_date:     z.string().optional().or(z.literal('')),
  event_location: z.string().max(200).optional().or(z.literal('')),
})

// POST /api/admin/charities — add charity
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const data = CharitySchema.parse(body)

    const supabase = createAdminClient()
    const { data: charity, error } = await supabase
      .from('charities')
      .insert({ ...data, is_active: true })
      .select()
      .maybeSingle()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
      throw error
    }
    return NextResponse.json({ charity }, { status: 201 })
  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid data', issues: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Failed to create charity' }, { status: 500 })
  }
}

// PATCH /api/admin/charities — update charity
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('charities')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

// DELETE /api/admin/charities?id=uuid — soft delete (deactivate)
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = createAdminClient()
    // Soft delete — keep data, just deactivate
    const { error } = await supabase
      .from('charities')
      .update({ is_active: false })
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
