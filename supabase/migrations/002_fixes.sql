-- ============================================================
-- FAIRWAY — Migration 002: Bug Fixes & Admin Setup
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── 1. Clean up duplicate subscription rows ─────────────────
-- Caused by the upsert onConflict:'user_id' bug (now fixed in code).
-- This keeps only the most recently created subscription per user.
DELETE FROM public.subscriptions
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM public.subscriptions
  ORDER BY user_id, created_at DESC
);

-- ── 2. Verify subscriptions are readable after cleanup ───────
-- Should return one row per user
-- SELECT user_id, count(*) FROM subscriptions GROUP BY user_id;

-- ── 3. Create your admin account ────────────────────────────
-- Step 1: Sign up at /signup with your admin email first.
-- Step 2: Then run this query, replacing the email:
--
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE email = 'your-admin@email.com';
--
-- Step 3: Sign out and sign back in — you'll be redirected to /admin.

-- ── 4. Verify RLS policies allow service role reads ──────────
-- The service role (used server-side) bypasses RLS automatically.
-- No changes needed for server-side admin operations.

-- ── 5. Optional: Reset a user's subscription for re-testing ─
-- DELETE FROM public.subscriptions WHERE user_id = (
--   SELECT id FROM public.profiles WHERE email = 'test@example.com'
-- );
-- DELETE FROM public.charity_donations WHERE user_id = (
--   SELECT id FROM public.profiles WHERE email = 'test@example.com'
-- );

-- ── 6. Verify all tables exist ───────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
