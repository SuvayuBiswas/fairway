-- ============================================================
-- FAIRWAY — Supabase Database Schema (Razorpay Edition)
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name            TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  role                 TEXT NOT NULL DEFAULT 'subscriber' CHECK (role IN ('subscriber', 'admin')),
  charity_id           UUID,
  contrib_pct          INTEGER NOT NULL DEFAULT 10 CHECK (contrib_pct >= 10 AND contrib_pct <= 100),
  razorpay_customer_id TEXT UNIQUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. CHARITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.charities (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  description    TEXT,
  image_url      TEXT,
  website_url    TEXT,
  is_featured    BOOLEAN DEFAULT FALSE,
  is_active      BOOLEAN DEFAULT TRUE,
  upcoming_event TEXT,
  event_date     DATE,
  event_location TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_charity
  FOREIGN KEY (charity_id) REFERENCES public.charities(id) ON DELETE SET NULL;

-- ============================================================
-- 3. SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  razorpay_subscription_id TEXT UNIQUE,
  razorpay_customer_id     TEXT,
  plan                     TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  status                   TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'cancelled', 'lapsed', 'past_due', 'trialing')),
  amount_paise             INTEGER NOT NULL,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN DEFAULT FALSE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. GOLF SCORES (rolling 5-score, enforced by trigger)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.golf_scores (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score     INTEGER NOT NULL CHECK (score >= 1 AND score <= 45),
  played_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_golf_scores_user_played ON public.golf_scores(user_id, played_at DESC);

CREATE OR REPLACE FUNCTION enforce_rolling_five_scores()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.golf_scores
  WHERE id IN (
    SELECT id FROM public.golf_scores
    WHERE user_id = NEW.user_id
    ORDER BY played_at ASC, created_at ASC
    OFFSET 4
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rolling_five_scores
AFTER INSERT ON public.golf_scores
FOR EACH ROW EXECUTE FUNCTION enforce_rolling_five_scores();

-- ============================================================
-- 5. DRAWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.draws (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month               TEXT NOT NULL UNIQUE,
  draw_logic          TEXT NOT NULL DEFAULT 'random' CHECK (draw_logic IN ('random', 'algorithmic')),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'simulated', 'published', 'archived')),
  drawn_numbers       INTEGER[] CHECK (array_length(drawn_numbers, 1) = 5),
  total_pool_paise    BIGINT DEFAULT 0,
  jackpot_rolled      BOOLEAN DEFAULT FALSE,
  jackpot_carry_paise BIGINT DEFAULT 0,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. DRAW ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.draw_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draw_id     UUID NOT NULL REFERENCES public.draws(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  numbers     INTEGER[] NOT NULL,
  match_count INTEGER NOT NULL DEFAULT 0,
  is_winner   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draw_id, user_id)
);

-- ============================================================
-- 7. PRIZE PAYOUTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prize_payouts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draw_id             UUID NOT NULL REFERENCES public.draws(id),
  user_id             UUID NOT NULL REFERENCES public.profiles(id),
  draw_entry_id       UUID REFERENCES public.draw_entries(id),
  match_type          TEXT NOT NULL CHECK (match_type IN ('5_match', '4_match', '3_match')),
  gross_amount_paise  BIGINT NOT NULL,
  split_amount_paise  BIGINT NOT NULL,
  proof_url           TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  payment_status      TEXT NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending', 'paid', 'failed')),
  paid_at             TIMESTAMPTZ,
  admin_notes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. CHARITY DONATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.charity_donations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id),
  charity_id      UUID NOT NULL REFERENCES public.charities(id),
  subscription_id UUID REFERENCES public.subscriptions(id),
  amount_paise    INTEGER NOT NULL,
  month           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_draws_updated_at
  BEFORE UPDATE ON public.draws FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payouts_updated_at
  BEFORE UPDATE ON public.prize_payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 10. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charity_donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Anyone can read active charities" ON public.charities FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins manage charities" ON public.charities FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users view own subscription" ON public.subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users manage own scores" ON public.golf_scores FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Admins manage all scores" ON public.golf_scores FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Anyone reads published draws" ON public.draws FOR SELECT USING (status = 'published');
CREATE POLICY "Admins manage draws" ON public.draws FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users view own entries" ON public.draw_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins manage entries" ON public.draw_entries FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users view own payouts" ON public.prize_payouts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users upload proof" ON public.prize_payouts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admins manage payouts" ON public.prize_payouts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users view own donations" ON public.charity_donations FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins view all donations" ON public.charity_donations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 11. SEED DATA — Charities (India-focused)
-- ============================================================
INSERT INTO public.charities (name, slug, description, is_featured, is_active, upcoming_event, event_date, event_location)
VALUES
  ('Goonj', 'goonj', 'Transforming urban waste into a resource for rural communities — disaster relief, livelihood, and dignity.', TRUE, TRUE, 'Golf for Good Day', '2026-07-20', 'Delhi NCR'),
  ('CRY – Child Rights and You', 'cry', 'Ensuring long-lasting and sustainable change in the lives of underprivileged children across India.', FALSE, TRUE, NULL, NULL, NULL),
  ('iCall', 'icall', 'Mental health counselling and outreach services rooted in values of rights, inclusion, and social justice.', FALSE, TRUE, NULL, NULL, NULL),
  ('HelpAge India', 'helpage', 'Working for the cause and care of disadvantaged elderly people in India.', FALSE, TRUE, NULL, NULL, NULL),
  ('The Akshaya Patra Foundation', 'akshaya-patra', 'Running the world''s largest NGO-run school meal programme, serving millions of children daily.', FALSE, TRUE, 'Charity Golf Classic', '2026-09-05', 'Bengaluru'),
  ('Wildlife Trust of India', 'wti', 'Protecting wildlife and natural habitats across India through science-based conservation.', FALSE, TRUE, NULL, NULL, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 12. STORAGE BUCKET for winner proof uploads
-- ============================================================
-- Run in Supabase Dashboard > Storage:
-- 1. Create bucket named 'winner-proofs' (private)
-- 2. Add policy: authenticated users can INSERT to path starting with their user_id

-- ============================================================
-- DONE. Verify with:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- ============================================================
