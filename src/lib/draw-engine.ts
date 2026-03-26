// src/lib/draw-engine.ts
// Core draw logic: random & algorithmic modes

/**
 * Random draw — standard lottery style
 * Picks 5 unique numbers from 1–45
 */
export function randomDraw(): number[] {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1)
  const drawn: number[] = []
  while (drawn.length < 5) {
    const idx = Math.floor(Math.random() * pool.length)
    drawn.push(...pool.splice(idx, 1))
  }
  return drawn.sort((a, b) => a - b)
}

/**
 * Algorithmic draw — weighted by least-frequent user scores
 * Scores that appear least often across all users get HIGHER weight
 * (creates excitement by favouring rarer scores)
 */
export function algorithmicDraw(allUserScores: number[][]): number[] {
  // Count frequency of each score value (1–45)
  const freq: Record<number, number> = {}
  for (let i = 1; i <= 45; i++) freq[i] = 0
  allUserScores.flat().forEach(s => { freq[s] = (freq[s] || 0) + 1 })

  // Build weighted pool — inversely proportional to frequency
  const maxFreq = Math.max(...Object.values(freq)) + 1
  const weightedPool: number[] = []
  for (let n = 1; n <= 45; n++) {
    const weight = maxFreq - freq[n]  // least frequent = highest weight
    for (let w = 0; w < weight; w++) weightedPool.push(n)
  }

  // Pick 5 unique numbers from weighted pool
  const drawn: number[] = []
  const usedIndices = new Set<number>()
  while (drawn.length < 5) {
    const idx = Math.floor(Math.random() * weightedPool.length)
    const num = weightedPool[idx]
    if (!drawn.includes(num)) {
      drawn.push(num)
      usedIndices.add(idx)
    }
  }
  return drawn.sort((a, b) => a - b)
}

/**
 * Count how many of a user's scores match the drawn numbers
 */
export function countMatches(userNumbers: number[], drawnNumbers: number[]): number {
  return userNumbers.filter(n => drawnNumbers.includes(n)).length
}

/**
 * Determine match type from count
 */
export type MatchType = '5_match' | '4_match' | '3_match' | 'no_match'
export function getMatchType(matchCount: number): MatchType {
  if (matchCount === 5) return '5_match'
  if (matchCount === 4) return '4_match'
  if (matchCount === 3) return '3_match'
  return 'no_match'
}

/**
 * Pool share percentages per PRD
 */
export const POOL_SHARES = {
  '5_match': 0.40,
  '4_match': 0.35,
  '3_match': 0.25,
} as const

/**
 * Calculate split prize for each winner in a tier
 */
export function calculateSplitPrize(
  totalPoolPaise: number,
  matchType: '5_match' | '4_match' | '3_match',
  winnerCount: number,
  jackpotCarryPaise: number = 0
): number {
  const share = POOL_SHARES[matchType]
  let tierPot = Math.floor(totalPoolPaise * share)
  if (matchType === '5_match') tierPot += jackpotCarryPaise
  return Math.floor(tierPot / winnerCount)
}

/**
 * Process a full draw — returns all winners and prizes
 */
export function processDraw({
  drawnNumbers,
  entries,
  totalPoolPaise,
  jackpotCarryPaise = 0,
}: {
  drawnNumbers: number[]
  entries: Array<{ userId: string; numbers: number[] }>
  totalPoolPaise: number
  jackpotCarryPaise?: number
}): {
  winners: Array<{
    userId: string
    matchCount: number
    matchType: MatchType
    numbers: number[]
  }>
  jackpotWon: boolean
  newJackpotCarry: number
  payouts: Array<{
    userId: string
    matchType: '5_match' | '4_match' | '3_match'
    grossAmountPaise: number
    splitAmountPaise: number
  }>
} {
  // Score each entry
  const scored = entries.map(e => ({
    ...e,
    matchCount: countMatches(e.numbers, drawnNumbers),
    matchType: getMatchType(countMatches(e.numbers, drawnNumbers)),
  }))

  const winners = scored.filter(e => e.matchCount >= 3)
  const fiveWinners  = winners.filter(e => e.matchType === '5_match')
  const fourWinners  = winners.filter(e => e.matchType === '4_match')
  const threeWinners = winners.filter(e => e.matchType === '3_match')

  const jackpotWon = fiveWinners.length > 0
  const newJackpotCarry = jackpotWon ? 0 : Math.floor(totalPoolPaise * 0.40) + jackpotCarryPaise

  const payouts: Array<{
    userId: string
    matchType: '5_match' | '4_match' | '3_match'
    grossAmountPaise: number
    splitAmountPaise: number
  }> = []

  // 5-match payouts
  if (fiveWinners.length > 0) {
    const gross = Math.floor(totalPoolPaise * 0.40) + jackpotCarryPaise
    const split = calculateSplitPrize(totalPoolPaise, '5_match', fiveWinners.length, jackpotCarryPaise)
    fiveWinners.forEach(w => payouts.push({ userId: w.userId, matchType: '5_match', grossAmountPaise: gross, splitAmountPaise: split }))
  }

  // 4-match payouts
  if (fourWinners.length > 0) {
    const gross = Math.floor(totalPoolPaise * 0.35)
    const split = calculateSplitPrize(totalPoolPaise, '4_match', fourWinners.length)
    fourWinners.forEach(w => payouts.push({ userId: w.userId, matchType: '4_match', grossAmountPaise: gross, splitAmountPaise: split }))
  }

  // 3-match payouts
  if (threeWinners.length > 0) {
    const gross = Math.floor(totalPoolPaise * 0.25)
    const split = calculateSplitPrize(totalPoolPaise, '3_match', threeWinners.length)
    threeWinners.forEach(w => payouts.push({ userId: w.userId, matchType: '3_match', grossAmountPaise: gross, splitAmountPaise: split }))
  }

  return { winners, jackpotWon, newJackpotCarry, payouts }
}
