import { describe, it, expect } from 'vitest'
import { levelForXp, xpForReview, updateStreak, evaluateBadges, XP_CORRECT, XP_WRONG } from '@/lib/gamification/rules'

describe('levelForXp', () => {
  it('100 XP per level, starting at level 1', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(99)).toBe(1)
    expect(levelForXp(100)).toBe(2)
    expect(levelForXp(250)).toBe(3)
  })
})

describe('xpForReview', () => {
  it('correct gives XP_CORRECT, wrong gives XP_WRONG', () => {
    expect(xpForReview(true)).toBe(XP_CORRECT)
    expect(xpForReview(false)).toBe(XP_WRONG)
  })
})

describe('updateStreak', () => {
  it('first ever goal: streak 1', () => {
    expect(updateStreak(null, 0, 0)).toEqual({ streak: 1, freezesConsumed: 0, reset: false })
  })
  it('consecutive day: increments, no freeze used', () => {
    expect(updateStreak(1, 4, 2)).toEqual({ streak: 5, freezesConsumed: 0, reset: false })
  })
  it('one missed day with enough freezes: consumes 1, keeps streak', () => {
    expect(updateStreak(2, 4, 2)).toEqual({ streak: 5, freezesConsumed: 1, reset: false })
  })
  it('multi missed days, freezes cover gap: consumes gap, keeps streak', () => {
    // gap = 3 - 1 = 2 days missed
    expect(updateStreak(3, 4, 2)).toEqual({ streak: 5, freezesConsumed: 2, reset: false })
  })
  it('missed days exceed freezes: reset to 1, freezes consumed 0', () => {
    expect(updateStreak(3, 9, 1)).toEqual({ streak: 1, freezesConsumed: 0, reset: true })
  })
})

describe('evaluateBadges', () => {
  it('returns streak + level badges meeting thresholds', () => {
    expect(evaluateBadges({ streak: 7, level: 5 })).toEqual(expect.arrayContaining(['streak-7', 'level-5']))
  })
  it('skips mastered badges when masteredCount not provided', () => {
    expect(evaluateBadges({ streak: 1, level: 1 })).not.toContain('mastered-10')
  })
  it('includes mastered badge when count meets threshold', () => {
    expect(evaluateBadges({ streak: 1, level: 1, masteredCount: 10 })).toContain('mastered-10')
  })
  it('includes perfect-session only when perfectSession true', () => {
    expect(evaluateBadges({ streak: 1, level: 1, perfectSession: true })).toContain('perfect-session')
    expect(evaluateBadges({ streak: 1, level: 1 })).not.toContain('perfect-session')
  })
})
