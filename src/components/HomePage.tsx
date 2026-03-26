'use client'
// src/components/HomePage.tsx
import { useState, useEffect } from 'react'
import Link from 'next/link'
import styles from './HomePage.module.css'

interface Charity { id:string; name:string; description:string; is_featured:boolean; upcoming_event?:string; event_date?:string; event_location?:string }
interface Stats { subscriberCount:number; totalDonatedPaise:number; jackpotPaise:number }
function fmt(p:number){ return `₹${Math.round(p/100).toLocaleString('en-IN')}` }

export default function HomePage({ charities, stats }: { charities:Charity[]; stats:Stats }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])
  const featured = charities.find(c => c.is_featured) || charities[0]
  const others   = charities.filter(c => !c.is_featured).slice(0, 4)

  return (
    <>
      <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ''}`}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.logo}>Fairway</Link>
          <div className={styles.navLinks}>
            <a href="#how">How It Works</a><a href="#charities">Charities</a>
            <a href="#prizes">Prizes</a><a href="#plans">Plans</a>
          </div>
          <div className={styles.navActions}>
            <Link href="/login" className={`btn btn-ghost ${styles.navBtn}`}>Sign In</Link>
            <Link href="/signup" className={`btn btn-primary ${styles.navBtn}`}>Join Now</Link>
          </div>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroBg} />
        <div className={styles.heroContent}>
          <div className={styles.badge}><span className={styles.badgeDot} />Monthly draw now open</div>
          <h1>Golf.<br /><em>Give.</em><br />Win.</h1>
          <p className={styles.heroSub}>Track your Stableford scores, enter the monthly prize draw, and support the charity you love — all in one platform built for people who play with purpose.</p>
          <div className={styles.heroActions}>
            <Link href="/signup" className="btn btn-primary btn-lg">Join the Draw</Link>
            <a href="#how" className={styles.learnLink}>See how it works →</a>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.stat}><span className={styles.statN}>{fmt(stats.totalDonatedPaise)}</span><span className={styles.statL}>Donated to charity</span></div>
            <div className={styles.statDiv} />
            <div className={styles.stat}><span className={styles.statN}>{stats.subscriberCount.toLocaleString()}</span><span className={styles.statL}>Active members</span></div>
            <div className={styles.statDiv} />
            <div className={styles.stat}><span className={styles.statN}>{fmt(stats.jackpotPaise)}</span><span className={styles.statL}>Current jackpot</span></div>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.widget}>
            <div className={styles.wHeader}><span>Your Last 5 Scores</span><span className={styles.wBadge}>Active</span></div>
            {[{d:'15 Mar',p:37,w:82},{d:'08 Mar',p:30,w:67},{d:'01 Mar',p:33,w:73},{d:'22 Feb',p:26,w:58},{d:'15 Feb',p:29,w:64}].map((s,i)=>(
              <div key={i} className={`${styles.wRow} ${i===0?styles.wNewest:''}`}>
                <span className={styles.wDate}>{s.d}</span>
                <div className={styles.wBarWrap}><div className={styles.wBar} style={{width:`${s.w}%`}} /></div>
                <span className={styles.wPts}>{s.p}</span>
              </div>
            ))}
            <div className={styles.wFooter}><span>💚 10% → Macmillan</span><span className={styles.wDraw}>Draw in 16 days</span></div>
          </div>
        </div>
      </section>

      <div className={styles.trustBar}>
        <div className="container" style={{display:'flex',alignItems:'center',gap:24,flexWrap:'wrap'}}>
          <span style={{fontSize:'0.75rem',color:'var(--muted)',whiteSpace:'nowrap'}}>Members supporting</span>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {charities.map((c,i)=><span key={c.id} style={{fontSize:'0.82rem',opacity:0.6}}>{i>0&&<span style={{margin:'0 6px'}}>·</span>}{c.name}</span>)}
          </div>
        </div>
      </div>

      <section className={styles.how} id="how">
        <div className="container">
          <span className="section-label">How It Works</span>
          <h2>Three steps to<br /><em>play with purpose</em></h2>
          <div className={styles.steps}>
            {[
              {n:'01',t:'Subscribe & Choose Your Charity',b:'Pick a plan and select a charity from our vetted directory. A minimum of 10% of every subscription goes directly to your chosen cause.'},
              {n:'02',t:'Log Your Stableford Scores',b:'Enter your last 5 Stableford scores (1–45 range). Rolling logic means the newest score replaces the oldest automatically.'},
              {n:'03',t:'Enter the Monthly Draw & Win',b:'Your scores automatically enter you into the monthly draw. Match 3, 4, or all 5 numbers to win. Jackpot rolls over if unclaimed.'},
            ].map(s=>(
              <div key={s.n} className={styles.step}>
                <div className={styles.stepNum}>{s.n}</div>
                <h3>{s.t}</h3><p>{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.impact}>
        <div className="container">
          <div className={styles.impactGrid}>
            <div>
              <span className="section-label light">Our Impact</span>
              <h2 style={{color:'var(--white)'}}>&ldquo;Sport that<br />actually<br /><em>gives back.&rdquo;</em></h2>
              <p style={{color:'rgba(255,255,255,0.6)',marginTop:16}}>Every subscription puts money into two places: a prize pool that could change your year, and a charity that&apos;s changing someone&apos;s life.</p>
            </div>
            <div className={styles.impactCards}>
              {[{n:fmt(stats.totalDonatedPaise),l:'Donated to charities'},{n:'24',l:'Draws completed'},{n:'₹86,00,000',l:'Prizes paid out'},{n:String(charities.length),l:'Charity partners'}].map(s=>(
                <div key={s.l} className={styles.impactCard}><div className={styles.icN}>{s.n}</div><div className={styles.icL}>{s.l}</div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.prizes} id="prizes">
        <div className="container">
          <span className="section-label">Prize Structure</span>
          <h2>Three ways to<br /><em>win every month</em></h2>
          <p style={{marginBottom:'3rem',maxWidth:480}}>The prize pool is funded by every subscriber. Match more numbers, win a larger share.</p>
          <div className={styles.prizeCards}>
            {[
              {match:'5 Numbers',label:'Jackpot',pct:'40%',desc:'Rolls over to next month if no winner.',tag:'Jackpot Rollover',gold:true,dark:false},
              {match:'4 Numbers',label:'Major Prize',pct:'35%',desc:'Split equally among all 4-match winners that month.',tag:'Most Common Win',gold:false,dark:true},
              {match:'3 Numbers',label:'Standard Prize',pct:'25%',desc:'Shared equally among all 3-match winners.',tag:'Most Entries Win',gold:false,dark:false},
            ].map(p=>(
              <div key={p.match} className={`${styles.prizeCard} ${p.dark?styles.pDark:''}`}>
                <div className={styles.pcMatch}>{p.match}</div>
                <div className={styles.pcLabel}>{p.label}</div>
                <div className={styles.pcPct}>{p.pct}</div>
                <p className={styles.pcDesc}>{p.desc}</p>
                <span className={`${styles.pcTag} ${p.gold?styles.pcTagGold:''}`}>{p.tag}</span>
              </div>
            ))}
          </div>
          <p className={styles.prizeNote}>ℹ&nbsp; Prize pool auto-calculated monthly. Multiple winners in a tier split equally.</p>
        </div>
      </section>

      <section className={styles.charitiesSection} id="charities">
        <div className="container">
          <span className="section-label">Supporting</span>
          <h2>Choose the cause<br />you <em>care about most</em></h2>
          <p style={{marginBottom:'3rem',maxWidth:480}}>Pick from our vetted charity partners at signup. Change your charity anytime.</p>
          <div className={styles.charityGrid}>
            {featured&&(
              <div className={styles.charityFeatured}>
                <span className={styles.spotlight}>Spotlight Charity</span>
                <div style={{fontSize:'2.5rem',marginBottom:16}}>💚</div>
                <h3>{featured.name}</h3>
                <p>{featured.description}</p>
                {featured.upcoming_event&&<div className={styles.ccEvent}>📅 {featured.upcoming_event}{featured.event_date&&` · ${featured.event_date}`}{featured.event_location&&` · ${featured.event_location}`}</div>}
                <Link href="/signup" className="btn btn-primary btn-sm" style={{marginTop:12}}>Support This Charity</Link>
              </div>
            )}
            <div className={styles.charityOthers}>
              {others.map(c=>(
                <div key={c.id} className={styles.charityCard}>
                  <h3>{c.name}</h3><p>{c.description}</p>
                  <Link href="/signup" className={styles.learnMore}>Support →</Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.plansSection} id="plans">
        <div className="container">
          <span className="section-label">Membership</span>
          <h2>Simple, transparent<br /><em>pricing</em></h2>
          <div className={styles.plansGrid}>
            <div className={styles.planCard}>
              <div className={styles.planName}>Monthly</div>
              <div className={styles.planPrice}><span className={styles.planAmt}>₹900</span><span className={styles.planPer}>/month</span></div>
              <ul className={styles.planFeats}>{['Monthly draw entry','Score tracking (5 rolling)','Min 10% charity contribution','Dashboard access','Cancel anytime'].map(f=><li key={f}>✓ {f}</li>)}</ul>
              <Link href="/signup?plan=monthly" className="btn btn-outline btn-full">Get Started</Link>
            </div>
            <div className={`${styles.planCard} ${styles.planFeat}`}>
              <div className={styles.planBadge}>Best Value</div>
              <div className={styles.planName}>Yearly</div>
              <div className={styles.planPrice}><span className={styles.planAmt}>₹7,900</span><span className={styles.planPer}>/year</span></div>
              <div className={styles.planSaving}>Save ₹3,000 vs monthly</div>
              <ul className={styles.planFeats}>{['12 draw entries included','Score tracking (5 rolling)','Min 10% charity contribution','Dashboard access','Priority support'].map(f=><li key={f}>✓ {f}</li>)}</ul>
              <Link href="/signup?plan=yearly" className="btn btn-primary btn-full">Join Now</Link>
            </div>
          </div>
          <p className={styles.plansNote}>Minimum 10% of every subscription is donated to your chosen charity.</p>
        </div>
      </section>

      <section className={styles.testimonial}>
        <div className="container">
          <div className={styles.testInner}>
            <div className={styles.testVisual} />
            <div className={styles.testContent}>
              <div className={styles.qMark}>&ldquo;</div>
              <blockquote>I matched 4 numbers and won ₹28,000 in my sixth month. The fact that I was supporting iCall the whole time made it feel like a win before the draw even happened.</blockquote>
              <cite><strong>James Hartley</strong>&nbsp;· Subscriber since 2025 · Supporting Mind</cite>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className="container">
          <div className={styles.footerTop}>
            <div><div className={styles.footerLogo}>Fairway</div><p style={{color:'rgba(255,255,255,0.4)',fontSize:'0.875rem',maxWidth:220,marginTop:8}}>Golf. Give. Win. Built for players who care.</p></div>
            <div className={styles.footerLinks}>
              <div><h4>Platform</h4><a href="#how">How It Works</a><a href="#charities">Charities</a><a href="#prizes">Prizes</a><a href="#plans">Pricing</a></div>
              <div><h4>Account</h4><Link href="/signup">Sign Up</Link><Link href="/login">Sign In</Link></div>
              <div><h4>Legal</h4><a href="#">Terms</a><a href="#">Privacy</a></div>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <p>© 2026 Fairway. All rights reserved.</p>
            <p>A minimum of 10% of every subscription is donated to your chosen charity.</p>
          </div>
        </div>
      </footer>
    </>
  )
}
