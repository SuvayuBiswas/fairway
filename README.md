# Fairway — Golf Charity Subscription Platform
## Full-Stack Deployment Guide

---

## Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | JWT (httpOnly cookies) + Supabase Auth |
| Payments | Stripe Checkout + Customer Portal |
| Hosting | Vercel (new account, as per PRD) |
| Security | HTTPS enforced, HSTS, CSP headers |

---

## Step 1 — Supabase Setup

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Note your **Project URL** and **API Keys** (Settings → API)
3. Open **SQL Editor** → paste the entire contents of:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
4. Click **Run** — this creates all 8 tables, RLS policies, triggers, and seed charity data
5. Go to **Storage** → **New Bucket** → name it `winner-proofs` → set to **Private**
6. In Storage Policies, add: authenticated users can INSERT/SELECT to `{user_id}/*`

---

## Step 2 — Stripe Setup

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) (Test Mode)
2. **Products** → **Add Product**:
   - Name: `Fairway Monthly` → Price: £9.00/month recurring → Copy Price ID
   - Name: `Fairway Yearly` → Price: £79.00/year recurring → Copy Price ID
3. **Developers** → **API Keys** → copy Publishable and Secret keys
4. **Developers** → **Webhooks** → **Add Endpoint**:
   - URL: `https://your-domain.vercel.app/api/webhooks/stripe`
   - Events to listen:
     - `checkout.session.completed`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Copy the **Webhook Signing Secret**

> For local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

---

## Step 3 — Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

JWT_SECRET=<run: openssl rand -base64 64>

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 4 — Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Test accounts** (create via /signup):
- Regular user: sign up normally → complete Stripe test checkout
  - Test card: `4242 4242 4242 4242` · Any future date · Any CVC
- Admin: after creating an account, run in Supabase SQL Editor:
  ```sql
  UPDATE profiles SET role = 'admin' WHERE email = 'admin@yourdomain.com';
  ```

---

## Step 5 — Deploy to Vercel

1. Push your code to a **new GitHub repository**
2. Go to [vercel.com](https://vercel.com) → **New Account** (as per PRD)
3. **Import** the GitHub repository
4. In **Environment Variables**, add all keys from `.env.local`
   - For `NEXT_PUBLIC_APP_URL` use your Vercel URL: `https://your-project.vercel.app`
5. Click **Deploy**

### Post-deploy:
- Update Stripe webhook URL to your Vercel domain
- Update `NEXT_PUBLIC_APP_URL` in Vercel env vars to the live URL
- Trigger a redeployment

---

## API Routes Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register + issue JWT |
| POST | `/api/auth/login` | Public | Login + issue JWT |
| POST | `/api/auth/logout` | Any | Clear JWT cookie |
| GET | `/api/scores` | User | Get own scores |
| POST | `/api/scores` | User | Add score (rolling 5) |
| DELETE | `/api/scores?id=` | User | Remove score |
| GET | `/api/subscription` | User | Get subscription status |
| POST | `/api/subscription/checkout` | User | Create Stripe Checkout |
| POST | `/api/subscription/portal` | User | Open Stripe Portal |
| GET | `/api/charity` | Public | List charities |
| PATCH | `/api/charity` | User | Update charity/contrib |
| GET | `/api/draw` | User | Draw history + entries |
| POST | `/api/winners/upload-proof` | User | Upload proof screenshot |
| POST | `/api/webhooks/stripe` | Stripe | Webhook handler |
| GET | `/api/admin/draw` | Admin | List draws + pool data |
| POST | `/api/admin/draw` | Admin | Simulate / publish draw |
| GET | `/api/admin/users` | Admin | List all users |
| PATCH | `/api/admin/users` | Admin | Edit user |
| GET | `/api/admin/winners` | Admin | All payout records |
| PATCH | `/api/admin/winners` | Admin | Verify / mark paid |
| POST | `/api/admin/charities` | Admin | Add charity |
| PATCH | `/api/admin/charities` | Admin | Edit charity |
| DELETE | `/api/admin/charities?id=` | Admin | Deactivate charity |
| GET | `/api/admin/reports` | Admin | Analytics data |

---

## Database Schema

```
profiles          → extends auth.users (role, charity, contrib_pct, stripe_customer_id)
charities         → charity directory (name, slug, events, featured flag)
subscriptions     → Stripe subscription mirror (plan, status, period dates)
golf_scores       → rolling 5 scores per user (DB trigger auto-removes oldest)
draws             → monthly draws (logic, numbers, pool, jackpot rollover)
draw_entries      → snapshot of user numbers per draw (match_count, is_winner)
prize_payouts     → winner records (match_type, amounts, verification, payment_status)
charity_donations → audit trail of monthly charity contributions
```

---

## Security

| Feature | Implementation |
|---|---|
| HTTPS | Enforced in middleware (301 redirect) |
| HSTS | `max-age=63072000; includeSubDomains; preload` |
| Auth cookie | `httpOnly`, `secure` (prod), `sameSite=lax` |
| JWT expiry | 7 days |
| Stripe card data | Never touches server — handled by Stripe Checkout (PCI DSS compliant) |
| Row Level Security | Enabled on all Supabase tables |
| Admin bypass | Uses `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed) |
| CSP headers | Configured in `next.config.js` |
| Input validation | Zod schemas on all API routes |

---

## PRD Checklist

- ✅ User signup & login (Supabase Auth + JWT)
- ✅ Subscription flow — monthly (£9) and yearly (£79) via Stripe Checkout
- ✅ Score entry — 5-score rolling logic (DB trigger enforced)
- ✅ Draw system — random & algorithmic modes, simulation, publish
- ✅ Charity selection and contribution % calculation
- ✅ Winner verification flow (pending → approved → paid)
- ✅ User Dashboard — all 5 modules (scores, draw, charity, winnings, subscription)
- ✅ Admin Panel — users, draw engine, charities, winners, reports
- ✅ Stripe Customer Portal (manage/cancel subscription)
- ✅ Stripe Webhook handler (auto-subscription sync + charity donation recording)
- ✅ Row Level Security on all tables
- ✅ HTTPS enforced + HSTS headers
- ✅ Mobile-first responsive design
- ✅ Vercel deployment config
- ✅ Supabase schema with proper FK constraints and RLS
