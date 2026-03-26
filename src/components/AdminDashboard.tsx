'use client'
// src/components/AdminDashboard.tsx
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import styles from './AdminDashboard.module.css'

type Tab = 'overview' | 'users' | 'draw' | 'charities' | 'winners' | 'reports'

function fmt(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AdminDashboard(props: any) {
  const router = useRouter()
  const [tab, setTab]               = useState<Tab>('overview')
  const [toast, setToast]           = useState<{ msg: string; type?: string } | null>(null)
  const [drawLogic, setDrawLogic]   = useState<'random' | 'algorithmic'>('random')
  const [simResult, setSimResult]   = useState<any>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [pubLoading, setPubLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [verifying, setVerifying]   = useState<string | null>(null)
  const [paying, setPaying]         = useState<string | null>(null)

  const showToast = useCallback((msg: string, type?: string) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }, [])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  // Simulation
  const runSim = async () => {
    setSimLoading(true); setSimResult(null)
    try {
      const month = new Date().toISOString().slice(0, 7)
      const res = await fetch('/api/admin/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulate', month, drawLogic }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Failed', 'error'); return }
      setSimResult(data)
    } catch { showToast('Network error', 'error') }
    finally { setSimLoading(false) }
  }

  const publishDraw = async () => {
    if (!confirm('Publish this month\'s draw? This cannot be undone.')) return
    setPubLoading(true)
    try {
      const month = new Date().toISOString().slice(0, 7)
      const res = await fetch('/api/admin/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', month, drawLogic }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Failed', 'error'); return }
      showToast(`Published! ${data.winners} winner(s). Jackpot ${data.jackpotWon ? 'WON 🎉' : 'rolls over →'}`, 'success')
      router.refresh()
    } catch { showToast('Network error', 'error') }
    finally { setPubLoading(false) }
  }

  // Winner actions
  const verifyPayout = async (id: string, status: 'approved' | 'rejected') => {
    setVerifying(id)
    try {
      const res = await fetch('/api/admin/winners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', payoutId: id, verificationStatus: status }),
      })
      if (!res.ok) { showToast('Failed', 'error'); return }
      showToast(`Winner ${status}`, 'success'); router.refresh()
    } catch { showToast('Network error', 'error') }
    finally { setVerifying(null) }
  }

  const markPaid = async (id: string) => {
    setPaying(id)
    try {
      const res = await fetch('/api/admin/winners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid', payoutId: id }),
      })
      if (!res.ok) { showToast('Failed', 'error'); return }
      showToast('Marked as paid ✓', 'success'); router.refresh()
    } catch { showToast('Network error', 'error') }
    finally { setPaying(null) }
  }

  const deleteCharity = async (id: string, name: string) => {
    if (!confirm(`Deactivate "${name}"?`)) return
    const res = await fetch(`/api/admin/charities?id=${id}`, { method: 'DELETE' })
    if (res.ok) { showToast('Charity deactivated'); router.refresh() }
    else showToast('Failed', 'error')
  }

  const filteredUsers = (props.users || []).filter((u: any) =>
    u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  )

  const retentionRate = props.totalUsers > 0
    ? Math.round((props.activeSubscribers / props.totalUsers) * 100) : 0

  const NAV: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview',  label: 'Overview',    icon: '📊' },
    { id: 'users',     label: 'Users',       icon: '👥' },
    { id: 'draw',      label: 'Draw Engine', icon: '🎯' },
    { id: 'charities', label: 'Charities',   icon: '💚' },
    { id: 'winners',   label: 'Winners',     icon: '🏆' },
    { id: 'reports',   label: 'Reports',     icon: '📈' },
  ]

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>Fairway <span className={styles.adminTag}>Admin</span></div>
        <nav className={styles.nav}>
          {NAV.map(n => (
            <button key={n.id} className={`${styles.navItem} ${tab === n.id ? styles.active : ''}`} onClick={() => setTab(n.id)}>
              <span>{n.icon}</span>
              <span className={styles.navLabel}>{n.label}</span>
            </button>
          ))}
        </nav>
        <button className={styles.signout} onClick={logout}>← Back to site</button>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <h2 className={styles.topTitle}>Admin Panel</h2>
            <p className={styles.topSub}>{props.activeSubscribers} active subscribers · {props.totalUsers} total users</p>
          </div>
          <div className={styles.adminBadge}>A</div>
        </div>

        <div className={styles.content}>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>Platform Overview</h2>
              <div className={styles.statsGrid}>
                {[
                  { n: props.totalUsers.toLocaleString(),         l: 'Total Users' },
                  { n: props.activeSubscribers.toLocaleString(),  l: 'Active Subscribers' },
                  { n: fmt(props.pool?.totalPaise || 0),          l: 'Current Prize Pool' },
                  { n: fmt(props.totalDonatedPaise || 0),         l: 'Total Donated' },
                ].map(s => (
                  <div key={s.l} className={styles.statCard}>
                    <div className={styles.statNum}>{s.n}</div>
                    <div className={styles.statLabel}>{s.l}</div>
                  </div>
                ))}
              </div>

              <div className={styles.poolCard}>
                <div className={styles.poolCardTitle}>This Month's Prize Pool Breakdown</div>
                <div className={styles.poolRows}>
                  <div className={styles.poolRow}><span>5-Match Jackpot (40%)</span><span className={styles.poolAmt}>{fmt(props.pool?.jackpotPaise || 0)}</span><span className={`${styles.poolTag} ${styles.jackpotTag}`}>Rollover Active</span></div>
                  <div className={styles.poolRow}><span>4-Match Prize (35%)</span><span className={styles.poolAmt}>{fmt(props.pool?.fourMatchPaise || 0)}</span><span className={styles.poolTag}>Active</span></div>
                  <div className={styles.poolRow}><span>3-Match Prize (25%)</span><span className={styles.poolAmt}>{fmt(props.pool?.threeMatchPaise || 0)}</span><span className={styles.poolTag}>Active</span></div>
                  <div className={`${styles.poolRow} ${styles.poolTotal}`}><strong>Total</strong><strong className={styles.poolAmt}>{fmt(props.pool?.totalPaise || 0)}</strong><span /></div>
                </div>
              </div>

              <div className={styles.chartCard}>
                <div className={styles.chartTitle}>Subscriber Growth</div>
                <div className={styles.chartBars}>
                  {[['Oct',45],['Nov',55],['Dec',52],['Jan',70],['Feb',78],['Mar',100]].map(([m, h], i) => (
                    <div key={m} className={styles.barGroup}>
                      <div className={`${styles.bar} ${i === 5 ? styles.barActive : ''}`} style={{ height: `${h}%` }} />
                      <span className={styles.barLabel}>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* USERS */}
          {tab === 'users' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>User Management</h2>
              <input className="input" style={{ maxWidth: 360, marginBottom: 20 }} placeholder="Search name or email…"
                value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              <div className={styles.table}>
                <div className={`${styles.tableRow} ${styles.tableHeader} ${styles.userCols}`}>
                  <span>Name</span><span>Email</span><span>Plan</span><span>Status</span><span>Charity</span><span></span>
                </div>
                {filteredUsers.length === 0 && <div className={styles.tableEmpty}>No users found</div>}
                {filteredUsers.map((u: any) => {
                  const sub = Array.isArray(u.subscription) ? u.subscription[0] : u.subscription
                  const charity = Array.isArray(u.charity) ? u.charity[0] : u.charity
                  return (
                    <div key={u.id} className={`${styles.tableRow} ${styles.userCols}`}>
                      <span className={styles.bold}>{u.full_name}</span>
                      <span className={styles.muted}>{u.email}</span>
                      <span style={{ textTransform: 'capitalize' }}>{sub?.plan || '—'}</span>
                      <span><span className={`badge badge-${sub?.status || 'lapsed'}`}>{sub?.status || 'no sub'}</span></span>
                      <span>{charity?.name || '—'}</span>
                      <span><button className="btn btn-ghost btn-sm" onClick={() => showToast(`Edit modal for ${u.full_name}`)}>Edit</button></span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* DRAW ENGINE */}
          {tab === 'draw' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>Draw Engine</h2>

              <div className={styles.drawSection}>
                <h3>Draw Logic</h3>
                <div className={styles.radioGroup}>
                  {(['random', 'algorithmic'] as const).map(v => (
                    <label key={v} className={styles.radioLabel}>
                      <input type="radio" value={v} checked={drawLogic === v} onChange={() => setDrawLogic(v)} />
                      {v === 'random' ? 'Random — standard lottery draw' : 'Algorithmic — weighted by least-frequent user scores'}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.drawSection}>
                <h3>Current Draw — {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3>
                <div className={styles.drawActions}>
                  <button className="btn btn-outline" onClick={runSim} disabled={simLoading}>
                    {simLoading ? <><span className="spinner spinner-dark" style={{marginRight:6}} />Simulating…</> : '▶ Run Simulation'}
                  </button>
                  <button className="btn btn-primary" onClick={publishDraw} disabled={pubLoading}>
                    {pubLoading ? <><span className="spinner" style={{marginRight:6}} />Publishing…</> : '🚀 Publish Results'}
                  </button>
                </div>
                {simResult && (
                  <div className={styles.simResult}>
                    <div className={styles.simLabel}>Simulation (not published)</div>
                    <div className={styles.simBalls}>
                      {simResult.drawnNumbers?.map((n: number, i: number) => (
                        <div key={i} className={styles.simBall}>{n}</div>
                      ))}
                    </div>
                    <div className={styles.simStats}>
                      <span>🏆 5-Match: {simResult.winners?.fiveMatch ?? 0}</span>
                      <span>🥇 4-Match: {simResult.winners?.fourMatch ?? 0}</span>
                      <span>🥈 3-Match: {simResult.winners?.threeMatch ?? 0}</span>
                      <span style={{ color: simResult.jackpotWon ? 'var(--forest)' : 'var(--gold)' }}>
                        Jackpot: {simResult.jackpotWon ? 'WON 🎉' : 'Rolls over →'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.drawSection}>
                <h3>Draw History</h3>
                <div className={styles.table}>
                  <div className={`${styles.tableRow} ${styles.tableHeader} ${styles.drawCols}`}>
                    <span>Month</span><span>Status</span><span>Logic</span><span>Drawn Numbers</span><span>Pool</span><span>Jackpot</span>
                  </div>
                  {(props.draws || []).length === 0 && <div className={styles.tableEmpty}>No draws yet</div>}
                  {(props.draws || []).map((d: any) => (
                    <div key={d.id} className={`${styles.tableRow} ${styles.drawCols}`}>
                      <span className={styles.bold}>{d.month}</span>
                      <span><span className={`badge badge-${d.status === 'published' ? 'active' : 'pending'}`}>{d.status}</span></span>
                      <span style={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>{d.draw_logic}</span>
                      <span>
                        {d.drawn_numbers
                          ? <span className={styles.miniNums}>{d.drawn_numbers.join(' · ')}</span>
                          : <span className={styles.muted}>—</span>}
                      </span>
                      <span>{fmt(d.total_pool_paise)}</span>
                      <span style={{ color: d.jackpot_rolled ? 'var(--gold)' : 'var(--forest)', fontWeight: 600, fontSize: '0.8rem' }}>
                        {d.jackpot_rolled ? 'Rolled' : 'Won'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CHARITIES */}
          {tab === 'charities' && (
            <div className={styles.tabContent}>
              <div className={styles.tabTitleRow}>
                <h2 className={styles.tabTitle}>Charity Management</h2>
                <button className="btn btn-primary btn-sm" onClick={() => showToast('Full add-charity modal — ready to extend')}>+ Add Charity</button>
              </div>
              <div className={styles.table}>
                <div className={`${styles.tableRow} ${styles.tableHeader} ${styles.charityCols}`}>
                  <span>Charity</span><span>Members</span><span>Donated</span><span>Status</span><span>Actions</span>
                </div>
                {(props.charities || []).map((c: any) => {
                  const members = Array.isArray(c.members) ? c.members.reduce((s: number, m: any) => s + (m.count || 0), 0) : 0
                  const donated = Array.isArray(c.donations) ? c.donations.reduce((s: number, d: any) => s + (d.amount_paise || 0), 0) : 0
                  return (
                    <div key={c.id} className={`${styles.tableRow} ${styles.charityCols}`}>
                      <span className={styles.bold}>
                        {c.name}
                        {c.is_featured && <span className={styles.featuredTag}> ★</span>}
                      </span>
                      <span>{members.toLocaleString()}</span>
                      <span>{fmt(donated)}</span>
                      <span><span className={`badge badge-${c.is_active ? 'active' : 'lapsed'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => showToast(`Edit ${c.name}`)}>Edit</button>
                        {c.is_active && <button className="btn btn-danger btn-sm" onClick={() => deleteCharity(c.id, c.name)}>Deactivate</button>}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* WINNERS */}
          {tab === 'winners' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>Winner Verification</h2>
              {(props.payouts || []).length === 0 && (
                <div className={styles.emptyState}><p>No winner payouts yet.</p></div>
              )}
              <div className={styles.winnerList}>
                {(props.payouts || []).map((p: any) => {
                  const user = Array.isArray(p.user) ? p.user[0] : p.user
                  const draw = Array.isArray(p.draw) ? p.draw[0] : p.draw
                  return (
                    <div key={p.id} className={styles.winnerCard}>
                      <div className={styles.winnerTop}>
                        <div>
                          <div className={styles.winnerName}>{user?.full_name || '—'}</div>
                          <div className={styles.winnerMeta}>{user?.email} · {draw?.month} · {p.match_type.replace('_', '-')}</div>
                        </div>
                        <div className={styles.winnerRight}>
                          <div className={styles.winnerAmt}>{fmt(p.split_amount_paise)}</div>
                          <span className={`badge badge-${p.verification_status}`}>{p.verification_status}</span>
                          <span className={`badge badge-${p.payment_status}`}>{p.payment_status}</span>
                        </div>
                      </div>
                      <div className={styles.winnerActions}>
                        {p.proof_url
                          ? <button className="btn btn-ghost btn-sm" onClick={() => showToast('Proof image viewer')}>📷 View Proof</button>
                          : <span className={styles.muted} style={{ fontSize: '0.8rem' }}>No proof yet</span>
                        }
                        {p.verification_status === 'pending' && (
                          <>
                            <button className="btn btn-primary btn-sm" disabled={verifying === p.id} onClick={() => verifyPayout(p.id, 'approved')}>
                              {verifying === p.id ? <span className="spinner" /> : '✓ Approve'}
                            </button>
                            <button className="btn btn-danger btn-sm" disabled={verifying === p.id} onClick={() => verifyPayout(p.id, 'rejected')}>
                              ✕ Reject
                            </button>
                          </>
                        )}
                        {p.verification_status === 'approved' && p.payment_status === 'pending' && (
                          <button className="btn btn-primary btn-sm" disabled={paying === p.id} onClick={() => markPaid(p.id)}>
                            {paying === p.id ? <span className="spinner" /> : '💷 Mark Paid'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* REPORTS */}
          {tab === 'reports' && (
            <div className={styles.tabContent}>
              <h2 className={styles.tabTitle}>Reports & Analytics</h2>
              <div className={styles.statsGrid}>
                {[
                  { n: fmt(props.totalPaidOutPaise || 0), l: 'Total Prizes Paid' },
                  { n: fmt(props.totalDonatedPaise || 0), l: 'Total Donated' },
                  { n: String((props.draws || []).filter((d: any) => d.status === 'published').length), l: 'Draws Completed' },
                  { n: `${retentionRate}%`, l: 'Retention Rate' },
                ].map(s => (
                  <div key={s.l} className={styles.statCard}>
                    <div className={styles.statNum}>{s.n}</div>
                    <div className={styles.statLabel}>{s.l}</div>
                  </div>
                ))}
              </div>

              <div className={styles.reportSection}>
                <h3>Draw Statistics</h3>
                <div className={styles.table}>
                  <div className={`${styles.tableRow} ${styles.tableHeader} ${styles.reportCols}`}>
                    <span>Month</span><span>Pool</span><span>Status</span><span>Jackpot</span><span>Carry</span>
                  </div>
                  {(props.draws || []).map((d: any) => (
                    <div key={d.id} className={`${styles.tableRow} ${styles.reportCols}`}>
                      <span className={styles.bold}>{d.month}</span>
                      <span>{fmt(d.total_pool_paise)}</span>
                      <span><span className={`badge badge-${d.status === 'published' ? 'active' : 'pending'}`}>{d.status}</span></span>
                      <span style={{ color: d.jackpot_rolled ? 'var(--gold)' : 'var(--forest)', fontWeight: 600 }}>
                        {d.jackpot_rolled ? 'Rolled →' : 'Won ✓'}
                      </span>
                      <span>{d.jackpot_carry_paise > 0 ? fmt(d.jackpot_carry_paise) : '—'}</span>
                    </div>
                  ))}
                  {(props.draws || []).length === 0 && <div className={styles.tableEmpty}>No draws yet</div>}
                </div>
              </div>

              <div className={styles.reportSection}>
                <h3>Charity Breakdown</h3>
                <div className={styles.table}>
                  <div className={`${styles.tableRow} ${styles.tableHeader} ${styles.charityReportCols}`}>
                    <span>Charity</span><span>Members</span><span>Total Donated</span>
                  </div>
                  {(props.charities || []).map((c: any) => {
                    const members = Array.isArray(c.members) ? c.members.reduce((s: number, m: any) => s + (m.count || 0), 0) : 0
                    const donated = Array.isArray(c.donations) ? c.donations.reduce((s: number, d: any) => s + (d.amount_paise || 0), 0) : 0
                    return (
                      <div key={c.id} className={`${styles.tableRow} ${styles.charityReportCols}`}>
                        <span>{c.name}</span>
                        <span>{members.toLocaleString()}</span>
                        <span style={{ fontWeight: 600 }}>{fmt(donated)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type || ''}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
