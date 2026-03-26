// src/lib/razorpay.ts
// Payment utility functions (mock mode — no gateway required for demo)

export const PLAN_AMOUNTS = {
  monthly: 90000,  // ₹900 in paise
  yearly:  790000, // ₹7900 in paise
} as const

export const PLAN_LABELS = {
  monthly: '₹900/month',
  yearly:  '₹7,900/year (save ₹3,000)',
} as const

export function calculatePrizePool(activeSubscriberCount: number): {
  totalPaise: number
  jackpotPaise: number
  fourMatchPaise: number
  threeMatchPaise: number
} {
  const avgMonthlyPaise = PLAN_AMOUNTS.monthly
  const totalPaise = Math.floor(activeSubscriberCount * avgMonthlyPaise * 0.30)
  return {
    totalPaise,
    jackpotPaise:    Math.floor(totalPaise * 0.40),
    fourMatchPaise:  Math.floor(totalPaise * 0.35),
    threeMatchPaise: Math.floor(totalPaise * 0.25),
  }
}

export function calculateCharityAmount(subscriptionAmountPaise: number, contribPct: number): number {
  return Math.floor(subscriptionAmountPaise * (contribPct / 100))
}

export function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
