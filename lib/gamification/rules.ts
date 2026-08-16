import { BADGES } from './badges'
import type { BadgeContext } from './types'

export const XP_CORRECT = 10
export const XP_WRONG = 2
export const COIN_DAILY_GOAL = 50
export const COIN_MASTERY = 20
export const XP_PER_LEVEL = 100
export const FREEZE_PER_MILESTONE_DAYS = 7
export const FREEZE_CAP = 3

export function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function xpForReview(correct: boolean): number {
  return correct ? XP_CORRECT : XP_WRONG
}

export const XP_PASSAGE_BASE = 15
export const XP_PASSAGE_PER_CORRECT = 5
export function xpForPassage(correctCount: number): number {
  return XP_PASSAGE_BASE + XP_PASSAGE_PER_CORRECT * correctCount
}

export interface StreakUpdate {
  streak: number
  freezesConsumed: number
  reset: boolean
}

// 懶評估，於「今天首次達標」時呼叫。daysSinceLastGoal = today - lastGoalDate（天）。
//  - null：史上首次達標 → streak 1
//  - 1：昨天也達標 → 連續 +1
//  - >1：中間漏 gap = days-1 天；凍結夠就消耗 gap 並保住，否則歸 1、凍結歸 0
export function updateStreak(daysSinceLastGoal: number | null, currentStreak: number, freezes: number): StreakUpdate {
  if (daysSinceLastGoal === null) return { streak: 1, freezesConsumed: 0, reset: false }
  if (daysSinceLastGoal <= 1) return { streak: currentStreak + 1, freezesConsumed: 0, reset: false }
  const gap = daysSinceLastGoal - 1
  if (freezes >= gap) return { streak: currentStreak + 1, freezesConsumed: gap, reset: false }
  return { streak: 1, freezesConsumed: 0, reset: true }
}

export function evaluateBadges(ctx: BadgeContext): string[] {
  const earned: string[] = []
  for (const b of BADGES) {
    if (b.type === 'streak' && ctx.streak >= b.threshold) earned.push(b.key)
    else if (b.type === 'level' && ctx.level >= b.threshold) earned.push(b.key)
    else if (b.type === 'mastered' && ctx.masteredCount !== undefined && ctx.masteredCount >= b.threshold) earned.push(b.key)
    else if (b.type === 'perfect' && ctx.perfectSession === true) earned.push(b.key)
  }
  return earned
}
