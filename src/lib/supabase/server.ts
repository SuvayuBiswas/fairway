// src/lib/supabase/server.ts
// Server-side Supabase client (reads cookies for session)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createServerSupabaseClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: object) {
          try { (cookieStore as any).set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: object) {
          try { (cookieStore as any).set({ name, value: '', ...options }) } catch {}
        },
      },
    }
  )
}

// Admin client — bypasses RLS (server-only, never expose to browser)
import { createClient } from '@supabase/supabase-js'
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
