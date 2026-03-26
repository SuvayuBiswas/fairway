// src/app/signup/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from '../login/auth.module.css'

interface Charity { id: string; name: string; is_featured: boolean }

type Step = 1 | 2 | 'payment'

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep]           = useState<Step>(1)
  const [charities, setCharities] = useState<Charity[]>([])
  const [loading, setLoading]     = useState(false)
  const [paying, setPaying]       = useState(false)
  const [error, setError]         = useState('')
  const [mockOrder, setMockOrder] = useState<any>(null)
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' })

  const [form, setForm] = useState({
    fullName: '', email: '', password: '', confirmPassword: '',
    charityId: '', contribPct: 10, plan: 'monthly' as 'monthly' | 'yearly',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: name === 'contribPct' ? Number(value) : value }))
  }

  // Step 1 — account details
  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/charity')
      const data = await res.json()
      setCharities(data.charities || [])
      setStep(2)
    } catch { setError('Failed to load charities') }
    finally { setLoading(false) }
  }

  // Step 2 — charity + plan → register account then open payment
  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.charityId) { setError('Please select a charity'); return }
    setError('')
    setLoading(true)
    try {
      // Register account
      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: form.fullName, email: form.email,
          password: form.password, charityId: form.charityId,
          contribPct: form.contribPct,
        }),
      })
      const regData = await regRes.json()
      if (!regRes.ok) { setError(regData.error || 'Registration failed'); return }

      // Get mock order
      const checkoutRes = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: form.plan, charityId: form.charityId, contribPct: form.contribPct }),
      })
      const checkoutData = await checkoutRes.json()
      if (!checkoutRes.ok) { setError(checkoutData.error || 'Failed to setup payment'); return }

      setMockOrder(checkoutData)
      setStep('payment')
    } catch { setError('Something went wrong. Please try again.') }
    finally { setLoading(false) }
  }

  // Payment step — fake card form
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Basic mock validation
    const raw = card.number.replace(/\s/g, '')
    if (raw.length < 16) { setError('Enter a valid 16-digit card number'); return }
    if (!card.expiry.match(/^\d{2}\/\d{2}$/)) { setError('Enter expiry as MM/YY'); return }
    if (card.cvv.length < 3) { setError('Enter a valid CVV'); return }
    if (!card.name.trim()) { setError('Enter cardholder name'); return }

    setPaying(true)
    try {
      // Simulate a 1.5s payment processing delay
      await new Promise(r => setTimeout(r, 1500))

      const verifyRes = await fetch('/api/subscription/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mockOrderId: mockOrder.mockOrderId,
          plan:        form.plan,
          charityId:   form.charityId,
          contribPct:  form.contribPct,
        }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok) { setError(verifyData.error || 'Payment failed'); return }

      router.push('/dashboard?checkout=success')
    } catch { setError('Payment failed. Please try again.') }
    finally { setPaying(false) }
  }

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(.{4})/g, '$1 ').trim()
  }

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4)
    if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2)
    return digits
  }

  const planLabel = form.plan === 'monthly' ? '₹900/month' : '₹7,900/year'

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard} style={{ maxWidth: step === 'payment' ? 440 : 420 }}>
        <Link href="/" className={styles.authLogo}>Fairway</Link>

        {/* ── Step 1: Account ──────────────────────── */}
        {step === 1 && (
          <>
            <h1 className={styles.authTitle}>Create account</h1>
            <p className={styles.authSub}>Join thousands playing golf with purpose</p>
            {error && <div className={styles.errorBanner}>{error}</div>}
            <form onSubmit={handleStep1} className={styles.form}>
              <div className="form-group">
                <label>Full Name</label>
                <input className="input" name="fullName" type="text" placeholder="Arjun Sharma"
                  value={form.fullName} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input className="input" name="email" type="email" placeholder="arjun@example.com"
                  value={form.email} onChange={handleChange} required autoComplete="email" />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input className="input" name="password" type="password" placeholder="Minimum 8 characters"
                  value={form.password} onChange={handleChange} required autoComplete="new-password" />
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <input className="input" name="confirmPassword" type="password" placeholder="Repeat password"
                  value={form.confirmPassword} onChange={handleChange} required />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Continue →'}
              </button>
            </form>
          </>
        )}

        {/* ── Step 2: Charity + Plan ───────────────── */}
        {step === 2 && (
          <>
            <h1 className={styles.authTitle}>Choose your plan</h1>
            <p className={styles.authSub}>Select a charity and membership plan</p>
            {error && <div className={styles.errorBanner}>{error}</div>}
            <form onSubmit={handleStep2} className={styles.form}>
              <div className="form-group">
                <label>Select Your Charity</label>
                <select className="input" name="charityId" value={form.charityId} onChange={handleChange} required>
                  <option value="">Choose a charity...</option>
                  {charities.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.is_featured ? ' ★' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Charity Contribution: <strong style={{ color: 'var(--forest)' }}>{form.contribPct}%</strong></label>
                <div className="slider-wrap">
                  <input type="range" min={10} max={50} name="contribPct"
                    value={form.contribPct} onChange={handleChange} style={{ flex: 1 }} />
                  <span className="slider-val">{form.contribPct}%</span>
                </div>
                <p className="form-hint">Minimum 10% of your subscription goes directly to your charity.</p>
              </div>
              <div className="form-group">
                <label>Membership Plan</label>
                <div className={styles.planRadio}>
                  <label className={styles.planOption}>
                    <input type="radio" name="plan" value="monthly" checked={form.plan === 'monthly'} onChange={handleChange} />
                    Monthly — ₹900/month
                  </label>
                  <label className={styles.planOption}>
                    <input type="radio" name="plan" value="yearly" checked={form.plan === 'yearly'} onChange={handleChange} />
                    Yearly — ₹7,900/year
                    <span className={styles.saveTag}>Save ₹3,000</span>
                  </label>
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Continue to Payment →'}
              </button>
              <button type="button" className="btn btn-ghost btn-full mt-8" onClick={() => setStep(1)}>
                ← Back
              </button>
            </form>
          </>
        )}

        {/* ── Step 3: Mock Payment Form ────────────── */}
        {step === 'payment' && (
          <>
            {/* Secure payment header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>🔒</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>Secure Payment</span>
            </div>
            <h1 className={styles.authTitle} style={{ fontSize: '1.4rem' }}>Complete your membership</h1>
            <div style={{
              background: 'linear-gradient(135deg, #1a6b3a 0%, #0f4a28 100%)',
              borderRadius: 12, padding: '14px 18px', marginBottom: 20,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', margin: 0 }}>
                  {form.plan === 'monthly' ? 'Monthly' : 'Yearly'} plan
                </p>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem', margin: '2px 0 0' }}>{planLabel}</p>
              </div>
              <span style={{ fontSize: 28 }}>⛳</span>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <form onSubmit={handlePayment} className={styles.form}>
              <div className="form-group">
                <label>Cardholder Name</label>
                <input className="input" type="text" placeholder="Name on card"
                  value={card.name}
                  onChange={e => setCard(p => ({ ...p, name: e.target.value }))}
                  required />
              </div>
              <div className="form-group">
                <label>Card Number</label>
                <input className="input" type="text" placeholder="4111 1111 1111 1111"
                  value={card.number}
                  onChange={e => setCard(p => ({ ...p, number: formatCardNumber(e.target.value) }))}
                  maxLength={19} inputMode="numeric" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Expiry</label>
                  <input className="input" type="text" placeholder="MM/YY"
                    value={card.expiry}
                    onChange={e => setCard(p => ({ ...p, expiry: formatExpiry(e.target.value) }))}
                    maxLength={5} inputMode="numeric" required />
                </div>
                <div className="form-group">
                  <label>CVV</label>
                  <input className="input" type="password" placeholder="•••"
                    value={card.cvv}
                    onChange={e => setCard(p => ({ ...p, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    maxLength={4} inputMode="numeric" required />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-full" disabled={paying}
                style={{ marginTop: 8, fontSize: '1rem', padding: '14px' }}>
                {paying ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span className="spinner" /> Processing payment...
                  </span>
                ) : `Pay ${planLabel}`}
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: 12 }}>
                🔒 Demo environment — no real payment is processed
              </p>
            </form>
          </>
        )}

        {step !== 'payment' && (
          <p className={styles.switchLink}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  )
}
