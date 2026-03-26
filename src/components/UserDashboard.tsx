'use client'
// src/components/UserDashboard.tsx
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import styles from './UserDashboard.module.css'

// ── Types ────────────────────────────────────────────────────
interface Score    { id: string; score: number; played_at: string }
interface Charity  { id: string; name: string; slug: string }
interface Profile  { id: string; full_name: string; email: string; contrib_pct: number; charity: Charity | null }
interface Sub      { id: string; plan: string; status: string; amount_paise: number; current_period_end: string; cancel_at_period_end: boolean }
interface Payout   { id: string; match_type: string; split_amount_paise: number; payment_status: string; verification_status: string; proof_url: string | null; draw: { month: string } | null }
interface DrawEntry{ id: string; numbers: number[]; match_count: number; is_winner: boolean; draw: { month: string; drawn_numbers: number[] | null; status: string } | null }

interface Props {
  user:         { sub: string; email: string; role: string }
  profile:      Profile | null
  scores:       Score[]
  subscription: Sub | null
  charities:    Charity[]
  donations:    Array<{ amount_paise: number; month: string; charity: { name: string } | null }>
  payouts:      Payout[]
  currentDraw:  { id: string; month: string; drawn_numbers: number[] | null; status: string; total_pool_paise: number; jackpot_carry_paise: number } | null
  drawEntries:  DrawEntry[]
  checkoutStatus?: string
}

type Tab = 'scores' | 'draw' | 'charity' | 'winnings' | 'subscription'

function fmt(paise: number) { return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
function fmtDate(d: string)  { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) }


// ── Main Component ───────────────────────────────────────────
export default function UserDashboard(props: Props) {
  const router = useRouter()
  const [tab, setTab]           = useState<Tab>('scores')
  const [scores, setScores]     = useState<Score[]>(props.scores)
  const [newScore, setNewScore] = useState('')
  const [newDate, setNewDate]   = useState(new Date().toISOString().split('T')[0])
  const [addingScore, setAddingScore] = useState(false)
  const [toast, setToast]       = useState<{ msg: string; type?: string } | null>(null)
  const [contribPct, setContribPct] = useState(props.profile?.contrib_pct || 10)
  const [selectedCharity, setSelectedCharity] = useState(props.profile?.charity?.id || '')
  const [savingCharity, setSavingCharity] = useState(false)
  const [cancellingPlan, setCancellingPlan] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  const showToast = useCallback((msg: string, type?: string) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
  }, [])

  useEffect(() => {
    if (props.checkoutStatus === 'success') showToast('Subscription activated! Welcome to Fairway.', 'success')
    if (props.checkoutStatus === 'cancelled') showToast('Payment cancelled — subscribe anytime from your dashboard.', 'error')
  }, [props.checkoutStatus, showToast])

  // ── Score logic ──────────────────────────────────────────
  const addScore = async () => {
    const pts = parseInt(newScore)
    if (!pts || pts < 1 || pts > 45) { showToast('Score must be 1–45', 'error'); return }
    if (!newDate) { showToast('Please select a date', 'error'); return }
    if (new Date(newDate) > new Date()) { showToast('Date cannot be in the future', 'error'); return }

    setAddingScore(true)
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: pts, played_at: newDate }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Failed to add score', 'error'); return }
      setScores(data.scores)
      setNewScore('')
      showToast(data.scores.length >= 5 ? 'Score added — oldest replaced' : 'Score added!', 'success')
    } catch {
      showToast('Network error', 'error')
    } finally {
      setAddingScore(false)
    }
  }

  const deleteScore = async (id: string) => {
    try {
      const res = await fetch(`/api/scores?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { showToast('Failed to remove score', 'error'); return }
      setScores(p => p.filter(s => s.id !== id))
      showToast('Score removed')
    } catch {
      showToast('Network error', 'error')
    }
  }

  // ── Charity update ───────────────────────────────────────
  const saveCharity = async () => {
    setSavingCharity(true)
    try {
      const res = await fetch('/api/charity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charityId: selectedCharity || undefined, contribPct }),
      })
      if (!res.ok) { showToast('Failed to update', 'error'); return }
      showToast('Charity settings saved!', 'success')
      router.refresh()
    } catch {
      showToast('Network error', 'error')
    } finally {
      setSavingCharity(false)
    }
  }

  // ── Mock Payment Modal state ─────────────────────────────
  const [showPayModal, setShowPayModal] = useState(false)
  const [pendingPlan, setPendingPlan]   = useState<'monthly' | 'yearly'>('monthly')
  const [mockOrder, setMockOrder]       = useState<any>(null)
  const [card, setCard] = useState({ number: '', expiry: '', cvv: '', name: '' })
  const [paying, setPaying] = useState(false)

  const formatCardNumber = (val: string) => val.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim()
  const formatExpiry = (val: string) => {
    const d = val.replace(/\D/g,'').slice(0,4)
    return d.length >= 3 ? d.slice(0,2)+'/'+d.slice(2) : d
  }

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    if (!selectedCharity && !props.profile?.charity?.id) {
      showToast('Please select a charity first', 'error')
      setTab('charity')
      return
    }
    setSubscribing(true)
    try {
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          charityId: selectedCharity || props.profile?.charity?.id,
          contribPct,
        }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Failed to initiate payment', 'error'); return }
      setMockOrder(data)
      setPendingPlan(plan)
      setCard({ number: '', expiry: '', cvv: '', name: '' })
      setShowPayModal(true)
    } catch {
      showToast('Network error', 'error')
    } finally {
      setSubscribing(false)
    }
  }

  const handleMockPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    const raw = card.number.replace(/\s/g,'')
    if (raw.length < 16) { showToast('Enter a valid 16-digit card number', 'error'); return }
    if (!card.expiry.match(/^\d{2}\/\d{2}$/)) { showToast('Enter expiry as MM/YY', 'error'); return }
    if (card.cvv.length < 3) { showToast('Enter a valid CVV', 'error'); return }
    if (!card.name.trim()) { showToast('Enter cardholder name', 'error'); return }

    setPaying(true)
    try {
      await new Promise(r => setTimeout(r, 1500))
      const verifyRes = await fetch('/api/subscription/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mockOrderId: mockOrder.mockOrderId,
          plan:        pendingPlan,
          charityId:   selectedCharity || props.profile?.charity?.id,
          contribPct,
        }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok) { showToast(verifyData.error || 'Payment failed', 'error'); return }
      setShowPayModal(false)
      showToast('Subscription activated! Welcome to Fairway.', 'success')
      router.refresh()
    } catch {
      showToast('Network error', 'error')
    } finally {
      setPaying(false)
    }
  }

  // ── Cancel Subscription ──────────────────────────────────
  const cancelSubscription = async () => {
    if (!confirm('Are you sure? Your subscription will remain active until the end of the current billing period.')) return
    setCancellingPlan(true)
    try {
      const res = await fetch('/api/subscription/cancel', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Failed to cancel', 'error'); return }
      showToast('Subscription will cancel at period end.', 'success')
      router.refresh()
    } catch {
      showToast('Network error', 'error')
    } finally {
      setCancellingPlan(false)
    }
  }

  // ── Logout ───────────────────────────────────────────────
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const name = props.profile?.full_name?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const sortedScores = [...scores].sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
  const totalWon     = props.payouts.reduce((s, p) => p.payment_status === 'paid' ? s + p.split_amount_paise : s, 0)
  const monthlyContrib = props.subscription ? Math.floor(props.subscription.amount_paise * contribPct / 100) : 0

  const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
    { id: 'scores',       label: 'Scores',       icon: '⛳' },
    { id: 'draw',         label: 'Draw',         icon: '🎯' },
    { id: 'charity',      label: 'Charity',      icon: '💚' },
    { id: 'winnings',     label: 'Winnings',     icon: '🏆' },
    { id: 'subscription', label: 'Subscription', icon: '💳' },
  ]

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>Fairway</div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`${styles.navItem} ${tab === item.id ? styles.active : ''}`}
              onClick={() => setTab(item.id)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          ))}
        </nav>
        <button className={styles.signout} onClick={logout}>Sign out →</button>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        {/* Topbar */}
        <div className={styles.topbar}>
          <div>
            <h2 className={styles.greeting}>{greeting}, {name}</h2>
            <p className={styles.subLine}>
              {props.currentDraw?.status === 'published'
                ? `Draw for ${props.currentDraw.month} published!`
                : 'Next draw runs at end of month'}
            </p>
          </div>
          <div className={styles.avatar}>{(props.profile?.full_name || 'U')[0].toUpperCase()}</div>
        </div>

        {/* Content */}
        <div className={styles.content}>

          {/* ── SCORES TAB ─────────────────────────────────── */}
          {tab === 'scores' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>My Golf Scores</h2>
              <p className={styles.tabSub}>Enter your last 5 Stableford scores (1–45). A new score automatically replaces the oldest.</p>

              {!props.subscription && (
                <div className={styles.warningBanner}>
                  ⚠️ You need an active subscription to enter scores.{' '}
                  <button
                    className="btn btn-primary"
                    style={{ marginLeft: 12, padding: '4px 14px', fontSize: '0.85rem' }}
                    onClick={() => setTab('subscription')}
                  >
                    Subscribe now →
                  </button>
                </div>
              )}

              <div className={styles.scoreEntryCard}>
                <div className={styles.scoreEntryRow}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Stableford Score (1–45)</label>
                    <input
                      className="input"
                      type="number"
                      min={1} max={45}
                      placeholder="e.g. 32"
                      value={newScore}
                      onChange={e => setNewScore(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addScore()}
                      disabled={!props.subscription}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Date Played</label>
                    <input
                      className="input"
                      type="date"
                      max={new Date().toISOString().split('T')[0]}
                      value={newDate}
                      onChange={e => setNewDate(e.target.value)}
                      disabled={!props.subscription}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={addScore}
                    disabled={addingScore || !props.subscription}
                    style={{ alignSelf: 'flex-end', marginBottom: '18px' }}
                  >
                    {addingScore ? <span className="spinner" /> : 'Add Score'}
                  </button>
                </div>
              </div>

              {sortedScores.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No scores yet. Add your first Stableford score above.</p>
                </div>
              ) : (
                <div className={styles.scoreList}>
                  {sortedScores.map((s, i) => {
                    const pct = Math.round((s.score / 45) * 100)
                    return (
                      <div key={s.id} className={`${styles.scoreItem} ${i === 0 ? styles.newest : ''}`}>
                        <span className={styles.scoreRank}>#{i + 1}</span>
                        <span className={styles.scoreDate}>{fmtDate(s.played_at)}</span>
                        <div className={styles.scoreBarWrap}>
                          <div className={styles.scoreBarFill} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={styles.scoreValue}>{s.score}</span>
                        <button
                          className={styles.scoreDel}
                          onClick={() => deleteScore(s.id)}
                          title="Remove score"
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── DRAW TAB ───────────────────────────────────── */}
          {tab === 'draw' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>Monthly Draw</h2>
              <p className={styles.tabSub}>Your 5 scores automatically enter you into the monthly draw. Match 3, 4, or 5 numbers to win.</p>

              <div className={styles.drawCard}>
                <div>
                  <div className={styles.drawLabel}>Your draw numbers this month</div>
                  <div className={styles.drawBalls}>
                    {sortedScores.length > 0
                      ? sortedScores.map((s, i) => (
                          <div key={i} className={styles.ball}>{s.score}</div>
                        ))
                      : <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>Add scores to enter the draw</p>
                    }
                  </div>
                </div>
                {props.currentDraw && (
                  <div className={styles.drawMeta}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={styles.drawMonth}>{props.currentDraw.month}</span>
                      <span className={`badge ${props.currentDraw.status === 'published' ? 'badge-active' : 'badge-pending'}`}>
                        {props.currentDraw.status}
                      </span>
                    </div>
                    {props.currentDraw.total_pool_paise > 0 && (
                      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginTop: 8 }}>
                        Prize pool: <strong style={{ color: '#fff' }}>{fmt(props.currentDraw.total_pool_paise)}</strong>
                        {props.currentDraw.jackpot_carry_paise > 0 && (
                          <span> (includes {fmt(props.currentDraw.jackpot_carry_paise)} jackpot carry)</span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <h3 className={styles.sectionH3}>Previous Draw Results</h3>
              {props.drawEntries.length === 0 ? (
                <p className="text-muted text-sm">No draw history yet.</p>
              ) : (
                <div className={styles.drawHistory}>
                  {props.drawEntries.map(entry => (
                    <div key={entry.id} className={styles.drawHistoryRow}>
                      <span className={styles.drawHistMonth}>{entry.draw?.month || '—'}</span>
                      <div className={styles.drawHistBalls}>
                        {entry.numbers.map((n, i) => {
                          const matched = entry.draw?.drawn_numbers?.includes(n)
                          return <span key={i} className={`${styles.ballSm} ${matched ? styles.ballMatch : ''}`}>{n}</span>
                        })}
                      </div>
                      <span className={
                        entry.match_count >= 5 ? styles.resultJackpot :
                        entry.match_count >= 4 ? styles.resultFour :
                        entry.match_count >= 3 ? styles.resultThree : styles.resultNone
                      }>
                        {entry.match_count >= 3 ? `${entry.match_count}-Number Match 🎉` : 'No match'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── CHARITY TAB ────────────────────────────────── */}
          {tab === 'charity' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>My Charity</h2>

              <div className={styles.charityCard}>
                <span style={{ fontSize: '2rem' }}>💚</span>
                <div>
                  <h3>{props.profile?.charity?.name || 'No charity selected'}</h3>
                  <p className="text-sm text-muted">Current charity partner</p>
                </div>
              </div>

              <div className="form-group mt-24">
                <label>Contribution: <strong style={{ color: 'var(--forest)' }}>{contribPct}%</strong>
                  {props.subscription && (
                    <span style={{ fontWeight: 400, color: 'var(--muted)' }}>
                      {' '}— {fmt(monthlyContrib)} per {props.subscription.plan === 'yearly' ? 'year' : 'month'}
                    </span>
                  )}
                </label>
                <div className="slider-wrap">
                  <input
                    type="range" min={10} max={50}
                    value={contribPct}
                    onChange={e => setContribPct(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span className="slider-val">{contribPct}%</span>
                </div>
                <p className="form-hint">Minimum 10% of your subscription. Increasing this helps your charity more.</p>
              </div>

              <div className="form-group mt-16">
                <label>Change Charity</label>
                <select
                  className="input"
                  value={selectedCharity}
                  onChange={e => setSelectedCharity(e.target.value)}
                >
                  <option value="">Keep current charity</option>
                  {props.charities.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <button className="btn btn-primary mt-8" onClick={saveCharity} disabled={savingCharity}>
                {savingCharity ? <span className="spinner" /> : 'Save Changes'}
              </button>

              {props.donations.length > 0 && (
                <>
                  <h3 className={styles.sectionH3}>Donation History</h3>
                  <div className={styles.donationList}>
                    {props.donations.map((d, i) => (
                      <div key={i} className={styles.donationRow}>
                        <span>{d.month}</span>
                        <span>{(d.charity as any)?.name || '—'}</span>
                        <span style={{ fontWeight: 600 }}>{fmt(d.amount_paise)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── WINNINGS TAB ───────────────────────────────── */}
          {tab === 'winnings' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>Winnings</h2>

              <div className={styles.winSummary}>
                <div className={styles.winCard}>
                  <div className={styles.winNum}>{fmt(totalWon)}</div>
                  <div className={styles.winLabel}>Total Won</div>
                </div>
                <div className={styles.winCard}>
                  <div className={styles.winNum}>{props.payouts.filter(p => p.payment_status === 'paid').length}</div>
                  <div className={styles.winLabel}>Prizes Paid</div>
                </div>
                <div className={styles.winCard}>
                  <div className={styles.winNum}>{props.payouts.filter(p => p.verification_status === 'pending').length}</div>
                  <div className={styles.winLabel}>Pending Verification</div>
                </div>
              </div>

              {props.payouts.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No winnings yet — keep entering the draw each month!</p>
                </div>
              ) : (
                <div className={styles.payoutList}>
                  {props.payouts.map(p => (
                    <div key={p.id} className={styles.payoutRow}>
                      <div>
                        <strong>{p.draw?.month || '—'} Draw</strong>
                        <p className="text-sm text-muted">{p.match_type.replace('_', '-')}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', fontWeight: 700 }}>{fmt(p.split_amount_paise)}</span>
                        <span className={`badge badge-${p.payment_status}`}>{p.payment_status}</span>
                        <span className={`badge badge-${p.verification_status}`}>{p.verification_status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SUBSCRIPTION TAB ───────────────────────────── */}
          {tab === 'subscription' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>Subscription</h2>

              {!props.subscription ? (
                <div className={styles.plansGrid}>
                  <p className="text-muted" style={{ gridColumn: '1/-1', marginBottom: 8 }}>
                    Choose a plan to start entering monthly draws and supporting your chosen charity.
                  </p>

                  <div className={styles.planCard}>
                    <div className={styles.planName}>Monthly</div>
                    <div className={styles.planPrice}>₹900<span>/month</span></div>
                    <ul className={styles.planFeatures}>
                      <li>✓ Monthly draw entry</li>
                      <li>✓ Score tracking</li>
                      <li>✓ Charity contribution</li>
                      <li>✓ Cancel anytime</li>
                    </ul>
                    <button
                      className="btn btn-primary btn-full"
                      onClick={() => handleSubscribe('monthly')}
                      disabled={subscribing}
                    >
                      {subscribing ? <span className="spinner" /> : 'Subscribe Monthly'}
                    </button>
                  </div>

                  <div className={`${styles.planCard} ${styles.planCardFeatured}`}>
                    <div className={styles.planBadge}>Best Value</div>
                    <div className={styles.planName}>Yearly</div>
                    <div className={styles.planPrice}>₹7,900<span>/year</span></div>
                    <p className={styles.planSaving}>Save ₹3,000 vs monthly</p>
                    <ul className={styles.planFeatures}>
                      <li>✓ 12 monthly draws</li>
                      <li>✓ Score tracking</li>
                      <li>✓ Charity contribution</li>
                      <li>✓ Priority winner verification</li>
                    </ul>
                    <button
                      className="btn btn-primary btn-full"
                      onClick={() => handleSubscribe('yearly')}
                      disabled={subscribing}
                    >
                      {subscribing ? <span className="spinner" /> : 'Subscribe Yearly'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.subCard}>
                    <div className={styles.subPlan}>{props.subscription.plan} plan</div>
                    <div className={`badge badge-${props.subscription.status}`} style={{ fontSize: '0.9rem', padding: '5px 14px' }}>
                      {props.subscription.status}
                    </div>
                    <p className="text-sm text-muted mt-8">
                      {fmt(props.subscription.amount_paise)}/{props.subscription.plan === 'yearly' ? 'year' : 'month'}
                      {' · '}
                      {props.subscription.cancel_at_period_end
                        ? `Cancels on ${fmtDate(props.subscription.current_period_end)}`
                        : `Renews on ${fmtDate(props.subscription.current_period_end)}`
                      }
                    </p>
                    <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
                      {!props.subscription.cancel_at_period_end && (
                        <button
                          className="btn btn-outline"
                          onClick={cancelSubscription}
                          disabled={cancellingPlan}
                        >
                          {cancellingPlan ? <span className="spinner spinner-dark" /> : 'Cancel Subscription'}
                        </button>
                      )}
                    </div>
                    {props.subscription.cancel_at_period_end && (
                      <p className="form-hint mt-8" style={{ color: '#c0392b' }}>
                        Your subscription will end on {fmtDate(props.subscription.current_period_end)}. You can re-subscribe at any time.
                      </p>
                    )}
                    <p className="form-hint mt-8">
                      Payments are processed securely via Razorpay. Your card details are never stored on our servers.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type || ''}`}>{toast.msg}</div>
        </div>
      )}

      {/* ── Mock Payment Modal ─────────────────────────────── */}
      {showPayModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 20, padding: '32px 28px',
            width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🔒</span>
                <span style={{ fontWeight: 600, fontSize: '1rem' }}>Secure Checkout</span>
              </div>
              <button onClick={() => setShowPayModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>
                ×
              </button>
            </div>

            {/* Plan summary */}
            <div style={{
              background: 'linear-gradient(135deg, #1a6b3a 0%, #0f4a28 100%)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 20,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.75rem', margin: 0 }}>
                  {pendingPlan === 'monthly' ? 'Monthly' : 'Yearly'} membership
                </p>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem', margin: '2px 0 0' }}>
                  {pendingPlan === 'monthly' ? '₹900/month' : '₹7,900/year'}
                </p>
              </div>
              <span style={{ fontSize: 26 }}>⛳</span>
            </div>

            {/* Card form */}
            <form onSubmit={handleMockPayment}>
              <div className="form-group">
                <label style={{ fontSize: '0.8rem' }}>Cardholder Name</label>
                <input className="input" type="text" placeholder="Name on card"
                  value={card.name}
                  onChange={e => setCard(p => ({ ...p, name: e.target.value }))}
                  required />
              </div>
              <div className="form-group">
                <label style={{ fontSize: '0.8rem' }}>Card Number</label>
                <input className="input" type="text" placeholder="4111 1111 1111 1111"
                  value={card.number}
                  onChange={e => setCard(p => ({ ...p, number: formatCardNumber(e.target.value) }))}
                  maxLength={19} inputMode="numeric" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.8rem' }}>Expiry</label>
                  <input className="input" type="text" placeholder="MM/YY"
                    value={card.expiry}
                    onChange={e => setCard(p => ({ ...p, expiry: formatExpiry(e.target.value) }))}
                    maxLength={5} inputMode="numeric" required />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.8rem' }}>CVV</label>
                  <input className="input" type="password" placeholder="•••"
                    value={card.cvv}
                    onChange={e => setCard(p => ({ ...p, cvv: e.target.value.replace(/\D/g,'').slice(0,4) }))}
                    maxLength={4} inputMode="numeric" required />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-full"
                disabled={paying}
                style={{ marginTop: 8, padding: '13px', fontSize: '0.95rem' }}>
                {paying ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span className="spinner" /> Processing...
                  </span>
                ) : `Pay ${pendingPlan === 'monthly' ? '₹900' : '₹7,900'}`}
              </button>
              <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--muted)', marginTop: 10 }}>
                🔒 Demo environment — no real payment is processed
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
