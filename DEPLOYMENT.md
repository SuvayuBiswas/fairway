# Fairway — Full Deployment Guide
## Golf Charity Subscription Platform

---

## STEP 1 — Supabase Setup

1. Go to https://supabase.com → New Project (use a **NEW** project as per PRD)
2. Choose a region (recommend `eu-west-2` for UK audience)
3. Save your DB password securely

### Run the schema:
- Dashboard → **SQL Editor** → New Query
- Paste entire contents of `supabase/migrations/001_initial_schema.sql`
- Click **Run**
- Verify: you should see 8 tables in Table Editor

### Create Storage bucket:
- Dashboard → **Storage** → New Bucket
- Name: `winner-proofs`
- Toggle: **Private** (not public)
- Click Create

### Storage RLS policy (run in SQL Editor):
```sql
CREATE POLICY "Users upload own proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'winner-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users view own proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'winner-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins view all proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'winner-proofs' AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
```

### Get your keys:
- Dashboard → Settings → **API**
- Copy: `Project URL`, `anon/public key`, `service_role key`

### Create an admin user:
Run in SQL Editor (after registering via the site or API):
```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your-admin@email.com';
```

---

## STEP 2 — Stripe Setup

1. Go to https://dashboard.stripe.com (use **TEST mode** — toggle top-left)
2. Create two products:

**Product 1: Fairway Monthly**
- Price: £9.00 GBP, recurring, monthly
- Copy the Price ID → `STRIPE_PRICE_MONTHLY`

**Product 2: Fairway Yearly**
- Price: £79.00 GBP, recurring, yearly
- Copy the Price ID → `STRIPE_PRICE_YEARLY`

3. API Keys → copy `Publishable key` and `Secret key`

4. Webhook (for local dev):
```bash
npm install -g stripe
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the webhook signing secret → STRIPE_WEBHOOK_SECRET
```

5. Webhook (for production — Vercel):
- Stripe Dashboard → Webhooks → Add endpoint
- URL: `https://your-domain.vercel.app/api/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Copy Signing secret → `STRIPE_WEBHOOK_SECRET`

---

## STEP 3 — Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

JWT_SECRET=your_random_64_char_string_here  # openssl rand -base64 64

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## STEP 4 — Local Development

```bash
cd fairway
npm install
npm run dev
# Open http://localhost:3000
```

Test the full flow:
- Sign up → Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC
- Add scores → verify rolling-5 logic
- Admin: update profile role to admin → access /admin

---

## STEP 5 — Deploy to Vercel (NEW account as per PRD)

1. Create a brand new Vercel account at https://vercel.com/signup

2. Push code to GitHub:
```bash
git init
git add .
git commit -m "Initial Fairway deployment"
git remote add origin https://github.com/your-username/fairway.git
git push -u origin main
```

3. In Vercel dashboard:
   - New Project → Import from GitHub → select `fairway`
   - Framework: **Next.js** (auto-detected)
   - Root directory: `fairway` (if repo root contains the package.json)

4. Add Environment Variables in Vercel dashboard:
   (Settings → Environment Variables — add each one from `.env.example`)
   - Set `NEXT_PUBLIC_APP_URL` to your Vercel URL: `https://your-project.vercel.app`

5. Deploy → wait ~2 minutes

6. Update Stripe webhook URL to your Vercel domain

### HTTPS:
- Vercel enforces HTTPS automatically on all deployments ✓
- The middleware adds `Strict-Transport-Security` header in production ✓
- All cookies are `secure: true` in production ✓

---

## STEP 6 — Test Credentials

After deploying:

**User Test Flow:**
- Register at `/signup` → use Stripe test card
- Email: any valid email
- Card: `4242 4242 4242 4242` · Expiry: `12/26` · CVC: `123`

**Admin Access:**
- Register any account → run SQL: `UPDATE profiles SET role='admin' WHERE email='...'`
- Visit `/admin`

---

## Architecture Summary

```
Next.js 14 (App Router)
├── Middleware        → JWT auth + HTTPS redirect + security headers
├── /app/page         → SSR homepage (Supabase server fetch)
├── /app/login        → Login page (JWT → httpOnly cookie)
├── /app/signup       → Signup → Stripe Checkout redirect
├── /app/dashboard    → Protected user dashboard (SSR)
├── /app/admin        → Protected admin panel (SSR, role=admin only)
├── /api/auth/*       → Register, Login, Logout
├── /api/scores       → Score CRUD (rolling-5 via DB trigger)
├── /api/subscription → Status, Checkout, Portal
├── /api/charity      → List, Update
├── /api/draw         → User draw history
├── /api/winners      → Proof upload
├── /api/admin/draw   → Simulate + Publish draw
├── /api/admin/users  → User management
├── /api/admin/winners→ Verify + Pay
├── /api/admin/charities → CRUD
├── /api/admin/reports→ Analytics
└── /api/webhooks/stripe → Subscription lifecycle

Supabase
├── Auth              → Email/password
├── Database          → 8 tables + RLS + triggers
└── Storage           → winner-proofs bucket (private)

Stripe
├── Checkout          → PCI-compliant card collection
├── Customer Portal   → Self-serve plan management
└── Webhooks          → Subscription sync to Supabase

JWT
└── httpOnly cookie, 7-day expiry, secure in production
```

---

## Security Checklist
- [x] HTTPS enforced (Vercel + middleware redirect)
- [x] HSTS header set in production
- [x] JWT in httpOnly cookie (XSS-safe)
- [x] Stripe handles all card data (PCI compliant — never touches our server)
- [x] Supabase RLS on all tables
- [x] Admin service role key server-only (never sent to browser)
- [x] Webhook signature verification
- [x] Input validation with Zod on all API routes
- [x] Content Security Policy headers
- [x] File upload type + size validation
- [x] X-Frame-Options: DENY
- [x] X-Content-Type-Options: nosniff
